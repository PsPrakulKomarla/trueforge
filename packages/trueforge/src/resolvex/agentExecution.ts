import { AgentThread } from '@truefoundry/trueforge-core/core/runtime/AgentThread';
import { AgentThreadOrchestrator } from '@truefoundry/trueforge-core/core/runtime/AgentThreadOrchestrator';
import type { AgentThreadExecutionEvent, AgentThreadExecutionResult } from '@truefoundry/trueforge-core/core/runtime/AgentThread.types';
import type { AgentTracing } from '@truefoundry/trueforge-core/core/tracing/AgentTracing';
import type { ITurnResourceResolver } from '@truefoundry/trueforge-core/agent-session';
import type { AgentSpec } from '@truefoundry/trueforge-core/agent-session';
import configuration from '../config';
import type { ILLM } from '@truefoundry/trueforge-core/core/llm/ILLM';
import type { Logger } from 'winston';
import type { Incident } from './domain/incident';
import type { ServiceGraph } from './graph/serviceGraph';
import { createResolvexAgentDefinition } from './agent';
import { createDevOpsToolRegistry } from './tools/devopsTool';
import { createDemoEnvironment, createDemoTools } from './tools/demoTools';
import { createResolvexToolMCP } from './tools/registryAdapter';
import { resolvexSettings } from './config';

export type ResolveXExecutionState = 'completed' | 'awaiting_approval' | 'failed';
export interface ResolveXExecutionResult { execution_id: string; state: ResolveXExecutionState; thread_id: string; events: AgentThreadExecutionEvent[]; runtime: AgentThreadExecutionResult; error?: string; }

export async function executeResolveXInvestigation(input: {
  incident: Incident;
  modelClient?: ILLM;
  tracing?: AgentTracing;
  logger?: Logger;
  resolver?: ITurnResourceResolver;
  spec?: AgentSpec;
  graph: ServiceGraph;
  signal?: AbortSignal;
  executionId?: string;
  tenantId?: string;
  userId?: string;
}): Promise<ResolveXExecutionResult> {
  const tracing = input.tracing ?? input.resolver?.createTracing();
  const logger = input.logger ?? input.resolver?.logger;
  if (!tracing || !logger) throw new Error('ResolveX runtime requires TrueForge tracing and logger resources');
  const resolved = input.resolver && input.spec ? await input.resolver.resolveAgentDefinition({ spec: input.spec, signal: input.signal ?? new AbortController().signal, tracing }) : undefined;
  const registry = createDevOpsToolRegistry();
  for (const tool of createDemoTools(createDemoEnvironment())) registry.register(tool);
  const executionId = input.executionId ?? `rex-${input.incident.id}-${Date.now().toString(36)}`;
  const threadId = `resolvex-${executionId}`;
  const graphContext = { affected: input.graph.getNode(input.incident.service), dependencies: input.graph.getDependencies(input.incident.service), dependents: input.graph.getDependents(input.incident.service), related: input.graph.relevantTo(input.incident.service, 2), nodes: input.graph.nodes(), edges: input.graph.edges() };
  const resolveXTools = createResolvexToolMCP({ registry, settings: resolvexSettings(configuration), tracing, context: () => ({ incidentId: input.incident.id, correlationId: input.incident.correlation_id, tenantId: input.tenantId ?? 'demo', userId: input.userId, signal: input.signal ?? new AbortController().signal }) });
  const definition = resolved ? { ...resolved.definition, toolSets: [...(resolved.definition.toolSets ?? []), resolveXTools], instruction: `${resolved.definition.instruction ?? ''}\nResolveX incident context: ${JSON.stringify({ incident: input.incident, graph: graphContext })}` } : createResolvexAgentDefinition({ modelClient: input.modelClient!, toolSet: resolveXTools, incident: input.incident, graphContext: { affected_service: input.incident.service, dependencies: graphContext.dependencies.map(node => node.id), dependents: graphContext.dependents.map(node => node.id), related_services: graphContext.related.map(node => node.id), nodes: graphContext.nodes, edges: graphContext.edges } });
  const thread = new AgentThread({ definition, threadId, title: `ResolveX incident ${input.incident.id}`, tracing, logger });
  const orchestrator = new AgentThreadOrchestrator({ agentThreads: new Map([[threadId, thread]]), createDynamicSubAgentThread: async () => { throw new Error('ResolveX sub-agents are not enabled in the controlled Phase 4 workflow'); }, tracing, logger });
  const prompt = `Investigate incident ${input.incident.id}. Use the available read-only tools and graph context to collect only relevant evidence. Produce a structured diagnosis and remediation proposal, but do not execute approval-required remediation. The incident store remains authoritative.`;
  for await (const ignored of orchestrator.send([{ type: 'user_message', content: prompt }])) void ignored;
  const events: AgentThreadExecutionEvent[] = [];
  const iterator = orchestrator.execute({ signal: input.signal ?? new AbortController().signal });
  let step = await iterator.next();
  while (!step.done) { events.push(step.value); step = await iterator.next(); }
  const runtime: AgentThreadExecutionResult = step.value;
  const awaiting = events.some(event => event.type === 'tool.approval_required');
  const failed = runtime.root_agent_error !== undefined;
  return { execution_id: executionId, state: failed ? 'failed' : awaiting ? 'awaiting_approval' : 'completed', thread_id: threadId, events, runtime, ...(runtime.root_agent_error === undefined ? {} : { error: runtime.root_agent_error.error }) };
}
