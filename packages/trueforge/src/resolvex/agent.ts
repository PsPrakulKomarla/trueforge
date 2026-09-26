import type { AgentDefinition, ILLM, IToolSet } from '@truefoundry/trueforge-core/core';
import type { Incident } from './domain/incident';
import type { GraphEdge, GraphNode } from './graph/serviceGraph';

export interface ResolvexGraphContext {
  affected_service: string;
  dependencies: string[];
  dependents: string[];
  related_services: string[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const RESOLVEX_INSTRUCTIONS = `You are ResolveX, an incident-response engineer operating inside TrueForge.
Inspect the incident and gather operational evidence with the available DevOps tools before forming hypotheses.
Separate observed facts, hypotheses, supporting evidence, and confirmed diagnosis. Do not fabricate logs, metrics, deployments, infrastructure state, remediation, or verification results.
Use dependency graph relationships only as investigation context; graph connectivity does not establish causation. Verify hypotheses with operational evidence.
Create a remediation plan and request human approval before any mutating action. Execute a mutating action only after an explicit allow decision; never bypass a denial.
Verify recovery with the verification tool and never claim recovery without a passing verification result. Escalate when evidence is insufficient or verification fails.`;

export function createResolvexAgentDefinition(input: {
  modelClient: ILLM;
  toolSet: IToolSet;
  incident?: Incident | undefined;
  graphContext?: ResolvexGraphContext | undefined;
}): AgentDefinition {
  const context = {
    ...(input.incident === undefined ? {} : { incident: input.incident }),
    ...(input.graphContext === undefined ? {} : { graph_context: input.graphContext }),
  };
  const contextInstructions =
    Object.keys(context).length === 0
      ? ''
      : `\nStructured incident and dependency context (graph relationships are context only):\n${JSON.stringify(context)}`;
  return {
    modelClient: input.modelClient,
    instruction: `${RESOLVEX_INSTRUCTIONS}${contextInstructions}`,
    toolSets: [input.toolSet],
  };
}
