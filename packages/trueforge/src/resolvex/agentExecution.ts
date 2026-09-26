import type { AgentSpec, ITurnResourceResolver } from '@truefoundry/trueforge-core/agent-session';
import type { ILLM } from '@truefoundry/trueforge-core/core/llm/ILLM';
import { AgentThread } from '@truefoundry/trueforge-core/core/runtime/AgentThread';
import type {
  AgentThreadExecutionEvent,
  AgentThreadExecutionResult,
} from '@truefoundry/trueforge-core/core/runtime/AgentThread.types';
import { AgentThreadOrchestrator } from '@truefoundry/trueforge-core/core/runtime/AgentThreadOrchestrator';
import type { AgentTracing } from '@truefoundry/trueforge-core/core/tracing/AgentTracing';
import type { Logger } from 'winston';
import configuration from '../config';
import { createResolvexAgentDefinition } from './agent';
import { resolvexSettings } from './config';
import type { Incident } from './domain/incident';
import type { GraphNode, ServiceGraph } from './graph/serviceGraph';
import { createDemoEnvironment, createDemoTools } from './tools/demoTools';
import { createDevOpsToolRegistry } from './tools/devopsTool';
import { createResolvexToolMCP } from './tools/registryAdapter';

export type ResolveXRunState = 'completed' | 'awaiting_approval' | 'failed';

export interface ResolveXExecutionResult {
  execution_id: string;
  state: ResolveXRunState;
  thread_id: string;
  events: AgentThreadExecutionEvent[];
  runtime: AgentThreadExecutionResult;
  error?: string;
}

interface ResolveXInvestigationInput {
  incident: Incident;
  graph: ServiceGraph;
  modelClient?: ILLM;
  tracing?: AgentTracing;
  logger?: Logger;
  resolver?: ITurnResourceResolver;
  spec?: AgentSpec;
  signal?: AbortSignal;
  executionId?: string;
  tenantId?: string;
  userId?: string;
}

export async function executeResolveXInvestigation(
  input: ResolveXInvestigationInput,
): Promise<ResolveXExecutionResult> {
  const tracing = input.tracing ?? input.resolver?.createTracing();
  const logger = input.logger ?? input.resolver?.logger;
  if (!tracing || !logger) {
    throw new Error('ResolveX runtime requires TrueForge tracing and logger resources');
  }
  const signal = input.signal ?? new AbortController().signal;
  const resolved =
    input.resolver && input.spec
      ? await input.resolver.resolveAgentDefinition({ spec: input.spec, signal, tracing })
      : undefined;
  const registry = createDevOpsToolRegistry();
  for (const tool of createDemoTools(createDemoEnvironment())) {
    registry.register(tool);
  }
  const executionId = input.executionId ?? `rex-${input.incident.id}-${Date.now().toString(36)}`;
  const threadId = `resolvex-${executionId}`;
  const dependencies = input.graph.getDependencies(input.incident.service);
  const dependents = input.graph.getDependents(input.incident.service);
  const related = input.graph
    .getRelatedNodes(input.incident.service)
    .filter(node => node.id !== input.incident.service);
  const nodes = input.graph.getNodes();
  const edges = input.graph.toJSON().edges;
  const graphContext = {
    affected: input.graph.getNode(input.incident.service),
    dependencies,
    dependents,
    related,
    nodes,
    edges,
  };
  const resolveXTools = createResolvexToolMCP({
    registry,
    settings: resolvexSettings(configuration),
    tracing,
    context: () => ({
      incidentId: input.incident.id,
      correlationId: input.incident.correlation_id,
      tenantId: input.tenantId ?? 'demo',
      signal,
      ...(input.userId === undefined ? {} : { userId: input.userId }),
    }),
  });
  const modelClient = input.modelClient;
  let definition;
  if (resolved) {
    definition = {
      ...resolved.definition,
      toolSets: [...(resolved.definition.toolSets ?? []), resolveXTools],
      instruction: `${resolved.definition.instruction ?? ''}\nResolveX incident context: ${JSON.stringify({ incident: input.incident, graph: graphContext })}`,
    };
  } else {
    if (modelClient === undefined) {
      throw new Error('ResolveX investigation needs a model client or a resolver spec');
    }
    definition = createResolvexAgentDefinition({
      modelClient,
      toolSet: resolveXTools,
      incident: input.incident,
      graphContext: {
        affected_service: input.incident.service,
        dependencies: dependencies.map((node: GraphNode) => node.id),
        dependents: dependents.map((node: GraphNode) => node.id),
        related_services: related.map((node: GraphNode) => node.id),
        nodes,
        edges,
      },
    });
  }
  const thread = new AgentThread({
    definition,
    threadId,
    title: `ResolveX incident ${input.incident.id}`,
    tracing,
    logger,
  });
  const orchestrator = new AgentThreadOrchestrator({
    agentThreads: new Map([[threadId, thread]]),
    createDynamicSubAgentThread: () => {
      throw new Error('ResolveX sub-agents are not enabled in the controlled Phase 4 workflow');
    },
    tracing,
    logger,
  });
  const prompt = `Investigate incident ${input.incident.id}. Use the available read-only tools and graph context to collect only relevant evidence. Produce a structured diagnosis and remediation proposal, but do not execute approval-required remediation. The incident store remains authoritative.`;
  for await (const ignored of orchestrator.send([{ type: 'user.message', content: prompt }])) {
    void ignored;
  }
  const events: AgentThreadExecutionEvent[] = [];
  const iterator = orchestrator.execute({ signal });
  let step = await iterator.next();
  while (!step.done) {
    events.push(step.value);
    step = await iterator.next();
  }
  const runtime: AgentThreadExecutionResult = step.value;
  const awaiting = events.some(event => event.type === 'tool.approval_required');
  const failed = runtime.root_agent_error !== undefined;
  return {
    execution_id: executionId,
    state: failed ? 'failed' : awaiting ? 'awaiting_approval' : 'completed',
    thread_id: threadId,
    events,
    runtime,
    ...(runtime.root_agent_error === undefined ? {} : { error: runtime.root_agent_error.error }),
  };
}
