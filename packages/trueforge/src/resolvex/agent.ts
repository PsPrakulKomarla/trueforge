import type { AgentDefinition } from '@truefoundry/trueforge-core/core/runtime/AgentDefinition';
import type { ILLM } from '@truefoundry/trueforge-core/core/llm/ILLM';
import type { AgentTracing } from '@truefoundry/trueforge-core/core/tracing/AgentTracing';
import { createResolveXToolMCP } from './tools/registryAdapter';
import { createDevOpsToolRegistry, type DevOpsToolRegistry } from './tools/devopsTool';
import { createDemoEnvironment, createDemoTools } from './tools/demoTools';

export function createResolveXAgentDefinition(params: { modelClient: ILLM; tracing: AgentTracing; registry?: DevOpsToolRegistry }): AgentDefinition {
  const registry = params.registry ?? createDevOpsToolRegistry();
  if (!params.registry) for (const tool of createDemoTools(createDemoEnvironment())) registry.register(tool);
  return { modelClient: params.modelClient, instruction: 'You are ResolveX. Investigate incidents with read-only tools first. Never execute remediation without an explicit approved tool decision.', iterationLimit: 12, toolSets: [createResolveXToolMCP(registry, params.tracing)] };
}
