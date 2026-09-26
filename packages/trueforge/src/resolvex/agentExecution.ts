import { AgentThread } from '@truefoundry/trueforge-core/core/runtime/AgentThread';
import { AgentThreadOrchestrator } from '@truefoundry/trueforge-core/core/runtime/AgentThreadOrchestrator';
import type { AgentThreadExecutionEvent, AgentThreadExecutionResult } from '@truefoundry/trueforge-core/core/runtime/AgentThread.types';
import type { AgentTracing } from '@truefoundry/trueforge-core/core/tracing/AgentTracing';
import type { ILLM } from '@truefoundry/trueforge-core/core/llm/ILLM';
import type { Logger } from 'winston';
import type { Incident } from './domain/incident';
import type { ServiceGraph } from './graph/serviceGraph';
import { createResolveXAgentDefinition } from './agent';
import { createDevOpsToolRegistry } from './tools/devopsTool';
import { createDemoEnvironment, createDemoTools } from './tools/demoTools';

export type ResolveXExecutionState = 'completed' | 'awaiting_approval' | 'failed';
export interface ResolveXExecutionResult { state: ResolveXExecutionState; thread_id: string; events: AgentThreadExecutionEvent[]; runtime: AgentThreadExecutionResult; }

export async function executeResolveXInvestigation(input: {
  incident: Incident;
  modelClient: ILLM;
  tracing: AgentTracing;
  logger: Logger;
  graph: ServiceGraph;
  signal?: AbortSignal;
}): Promise<ResolveXExecutionResult> {
  const registry = createDevOpsToolRegistry();
  for (const tool of createDemoTools(createDemoEnvironment())) registry.register(tool);
  const threadId = `resolvex-${input.incident.id}`;
  const graphContext = { affected: input.graph.getNode(input.incident.service), dependencies: input.graph.getDependencies(input.incident.service), dependents: input.graph.getDependents(input.incident.service), related: input.graph.relevantTo(input.incident.service, 2), nodes: input.graph.nodes(), edges: input.graph.edges() };
  const definition = createResolveXAgentDefinition({ modelClient: input.modelClient, tracing: input.tracing, registry, incident: input.incident, graphContext });
  const thread = new AgentThread({ definition, threadId, title: `ResolveX incident ${input.incident.id}`, tracing: input.tracing, logger: input.logger });
  const orchestrator = new AgentThreadOrchestrator({ agentThreads: new Map([[threadId, thread]]), createDynamicSubAgentThread: async () => { throw new Error('ResolveX sub-agents are not enabled in the controlled Phase 4 workflow'); }, tracing: input.tracing, logger: input.logger });
  const prompt = `Investigate incident ${input.incident.id}. Use the available read-only tools and graph context to collect only relevant evidence. Produce a structured diagnosis and remediation proposal, but do not execute approval-required remediation. The incident store remains authoritative.`;
  for await (const ignored of orchestrator.send([{ type: 'user_message', content: prompt }])) void ignored;
  const events: AgentThreadExecutionEvent[] = [];
  const iterator = orchestrator.execute({ signal: input.signal ?? new AbortController().signal });
  let step = await iterator.next();
  while (!step.done) { events.push(step.value); step = await iterator.next(); }
  const runtime: AgentThreadExecutionResult = step.value;
  const awaiting = events.some(event => event.type === 'tool.approval_required');
  return { state: awaiting ? 'awaiting_approval' : 'completed', thread_id: threadId, events, runtime };
}
