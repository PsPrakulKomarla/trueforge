import type { AgentDefinition, ILLM, IToolSet } from '@truefoundry/trueforge-core/core';

export interface ResolvexGraphContext {
  affected_service: string;
  dependencies: string[];
  dependents: string[];
  related_services: string[];
  nodes: { id: string; type: string; name: string }[];
  edges: { source: string; target: string; relationship: string }[];
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
  graphContext?: ResolvexGraphContext | undefined;
}): AgentDefinition {
  const graphInstructions =
    input.graphContext === undefined
      ? ''
      : `\nStructured dependency context (context only, not proof of causation):\n${JSON.stringify(input.graphContext)}`;
  return {
    modelClient: input.modelClient,
    instruction: `${RESOLVEX_INSTRUCTIONS}${graphInstructions}`,
    toolSets: [input.toolSet],
  };
}
