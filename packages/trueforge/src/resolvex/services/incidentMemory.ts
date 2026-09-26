import type { Incident } from '../domain/incident';
import type { ServiceGraph } from '../graph/serviceGraph';
import type { IncidentStore } from '../store/incidentStore';

export type SimilaritySignal =
  'same_service' | 'same_severity' | 'same_deployment' | 'matching_error_signature' | 'graph_related';
export interface SimilarIncident {
  incident_id: string;
  score: number;
  signals: SimilaritySignal[];
  diagnosis: Incident['diagnosis'];
  remediation: Incident['plan'];
  outcome: Incident['verification'];
}
export interface ResolutionRecord {
  incident_id: string;
  symptoms: string[];
  affected_service: string;
  related_services: string[];
  dependencies: string[];
  diagnosis: Incident['diagnosis'];
  remediation: Incident['plan'];
  approval_required: boolean;
  verification: Incident['verification'];
  duration_ms: number;
  successful_tools: string[];
  failed_tools: string[];
}
export interface RemediationRecommendation {
  recommendation: string;
  confidence: number;
  supporting_incidents: string[];
  supporting_evidence: string[];
  previous_outcomes: string[];
  risks: string[];
}

function deploymentOf(incident: Incident): string | undefined {
  return (
    incident.evidence.find(e => e.kind === 'deployment')?.data['deployment_id']?.toString() ??
    incident.evidence.find(e => e.kind === 'deployment')?.summary
  );
}
function errorSignature(incident: Incident): string | undefined {
  return (
    incident.evidence.find(e => e.kind === 'log')?.data['error_signature']?.toString() ??
    incident.evidence.find(e => e.kind === 'log')?.data['error']?.toString()
  );
}
export function similarity(current: Incident, previous: Incident, graph: ServiceGraph): SimilarIncident | undefined {
  if (current.id === previous.id) {
    return undefined;
  }
  const signals: SimilaritySignal[] = [];
  if (current.service === previous.service) {
    signals.push('same_service');
  }
  if (current.severity === previous.severity) {
    signals.push('same_severity');
  }
  if (deploymentOf(current) !== undefined && deploymentOf(current) === deploymentOf(previous)) {
    signals.push('same_deployment');
  }
  if (errorSignature(current) !== undefined && errorSignature(current) === errorSignature(previous)) {
    signals.push('matching_error_signature');
  }
  const related = new Set(graph.getRelatedNodes(current.service).map(node => node.id));
  if (related.has(previous.service)) {
    signals.push('graph_related');
  }
  if (signals.length === 0) {
    return undefined;
  }
  return {
    incident_id: previous.id,
    score: Math.min(1, signals.length / 5),
    signals,
    diagnosis: previous.diagnosis,
    remediation: previous.plan,
    outcome: previous.verification,
  };
}
export async function findSimilarIncidents(
  store: IncidentStore,
  current: Incident,
  graph: ServiceGraph,
): Promise<SimilarIncident[]> {
  const incidents = await store.list();
  return incidents
    .map(incident => similarity(current, incident, graph))
    .filter((item): item is SimilarIncident => item !== undefined)
    .sort((a, b) => b.score - a.score);
}
export function buildRecommendation(
  _current: Incident,
  similar: SimilarIncident[],
): RemediationRecommendation | undefined {
  const successful = similar.filter(item => item.outcome?.status === 'passed' && item.remediation !== null);
  const first = successful[0];
  if (!first?.remediation) {
    return undefined;
  }
  return {
    recommendation: first.remediation.steps.map(step => step.tool).join(', '),
    confidence: Math.min(0.9, 0.5 + successful.length * 0.1),
    supporting_incidents: successful.map(item => item.incident_id),
    supporting_evidence: similar.flatMap(item => item.signals),
    previous_outcomes: successful.map(item => item.outcome?.status ?? 'unknown'),
    risks: first.remediation.steps.map(step => step.risk),
  };
}
export function extractResolutionRecord(incident: Incident, graph: ServiceGraph): ResolutionRecord {
  const successful_tools = incident.actions.flatMap(action =>
    action.status === 'ok' && action.tool !== undefined ? [action.tool] : [],
  );
  const failed_tools = incident.actions.flatMap(action =>
    action.status === 'error' && action.tool !== undefined ? [action.tool] : [],
  );
  return {
    incident_id: incident.id,
    symptoms: incident.evidence.map(item => item.summary),
    affected_service: incident.service,
    related_services: graph.getRelatedNodes(incident.service).map(node => node.id),
    dependencies: graph.getDependencies(incident.service).map(node => node.id),
    diagnosis: incident.diagnosis,
    remediation: incident.plan,
    approval_required: incident.approvals.length > 0,
    verification: incident.verification,
    duration_ms: Math.max(0, Date.parse(incident.updated_at) - Date.parse(incident.detected_at)),
    successful_tools,
    failed_tools,
  };
}
