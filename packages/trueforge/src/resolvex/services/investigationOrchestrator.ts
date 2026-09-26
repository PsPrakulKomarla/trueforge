import type { EvidenceRecord, Incident } from '../domain/incident';
import type { ServiceGraph } from '../graph/serviceGraph';

export type HypothesisStatus = 'proposed' | 'testing' | 'supported' | 'weakened' | 'rejected' | 'confirmed';
export interface InvestigationHypothesis {
  id: string;
  statement: string;
  supporting_evidence_ids: string[];
  contradicting_evidence_ids: string[];
  strength: number;
  status: HypothesisStatus;
}
export interface InvestigationContext {
  incident_id: string;
  service: string;
  severity: Incident['severity'];
  state: Incident['state'];
  symptoms: string[];
  evidence: EvidenceRecord[];
  graph: { affected_service: string; dependencies: string[]; dependents: string[]; related: string[] };
  hypotheses: InvestigationHypothesis[];
  tool_calls: string[];
  max_steps: number;
}
export function buildInvestigationContext(
  incident: Incident,
  graph: ServiceGraph,
  options: { maxSteps?: number } = {},
): InvestigationContext {
  const related = graph.getRelatedNodes(incident.service).filter(node => node.id !== incident.service);
  return {
    incident_id: incident.id,
    service: incident.service,
    severity: incident.severity,
    state: incident.state,
    symptoms: incident.evidence.map(item => item.summary),
    evidence: incident.evidence,
    graph: {
      affected_service: incident.service,
      dependencies: graph.getDependencies(incident.service).map(node => node.id),
      dependents: graph.getDependents(incident.service).map(node => node.id),
      related: related.map(node => node.id),
    },
    hypotheses:
      incident.diagnosis?.hypotheses.map(item => ({
        id: item.id,
        statement: item.statement,
        supporting_evidence_ids: item.evidence_ids,
        contradicting_evidence_ids: [],
        strength: item.confidence,
        status: item.refuted ? 'rejected' : 'supported',
      })) ?? [],
    tool_calls: incident.actions.filter(action => action.tool !== undefined).map(action => action.tool!),
    max_steps: options.maxSteps ?? 12,
  };
}
export function hasRepeatedToolCall(context: InvestigationContext, tool: string): boolean {
  return context.tool_calls.filter(item => item === tool).length > 0;
}
export function rankHypothesis(
  hypothesis: InvestigationHypothesis,
  evidence: EvidenceRecord[],
): InvestigationHypothesis {
  const available = new Set(evidence.map(item => item.id));
  const supporting = hypothesis.supporting_evidence_ids.filter(id => available.has(id));
  const contradicting = hypothesis.contradicting_evidence_ids.filter(id => available.has(id));
  const strength = Math.max(0, Math.min(1, 0.5 + supporting.length * 0.15 - contradicting.length * 0.2));
  const status: HypothesisStatus =
    contradicting.length > supporting.length ? 'weakened' : strength >= 0.8 ? 'supported' : 'testing';
  return {
    ...hypothesis,
    supporting_evidence_ids: supporting,
    contradicting_evidence_ids: contradicting,
    strength,
    status,
  };
}
export function addHypothesis(
  context: InvestigationContext,
  hypothesis: InvestigationHypothesis,
): InvestigationContext {
  if (context.hypotheses.some(item => item.id === hypothesis.id)) {
    return context;
  }
  if (context.hypotheses.length >= context.max_steps) {
    return context;
  }
  return { ...context, hypotheses: [...context.hypotheses, rankHypothesis(hypothesis, context.evidence)] };
}
