import type { ServiceGraph } from '../graph/serviceGraph';
export interface Telemetry {
  service: string;
  timestamp: string;
  metrics: Record<string, number>;
  source: string;
}
export interface Baseline {
  signal: string;
  available: boolean;
  value?: number;
  observations: number;
  reason?: string;
}
export interface Anomaly {
  service: string;
  signal: string;
  observed: number;
  baseline?: number;
  deviation?: number;
  threshold: number;
  status: 'normal' | 'anomalous';
  explanation: string;
  source: string;
}
export interface RiskAssessment {
  level: 'low' | 'medium' | 'high';
  factors: string[];
  explanation: string;
  confidence: 'low' | 'medium' | 'high';
}
export type PredictionStatus =
  | 'prediction_created'
  | 'prediction_updated'
  | 'prediction_confirmed'
  | 'prediction_expired'
  | 'prediction_dismissed'
  | 'prediction_false_positive';
export interface Prediction {
  id: string;
  service: string;
  status: PredictionStatus;
  risk: RiskAssessment;
  anomalies: Anomaly[];
  predicted_window_minutes: number;
  at_risk_services: string[];
  unknowns: string[];
  created_at: string;
}
export function calculateBaseline(observations: Telemetry[], signal: string): Baseline {
  const values = observations
    .map(item => item.metrics[signal])
    .filter((value): value is number => typeof value === 'number');
  if (values.length < 2) {
    return { signal, available: false, observations: values.length, reason: 'insufficient_observations' };
  }
  return {
    signal,
    available: true,
    value: values.reduce((sum, value) => sum + value, 0) / values.length,
    observations: values.length,
  };
}
export function detectAnomaly(current: Telemetry, baseline: Baseline, signal: string, relativeThreshold = 1): Anomaly {
  const observed = current.metrics[signal];
  if (typeof observed !== 'number') {
    return {
      service: current.service,
      signal,
      observed: Number.NaN,
      threshold: relativeThreshold,
      status: 'normal',
      explanation: `No ${signal} observation is available`,
      source: current.source,
    };
  }
  if (!baseline.available || baseline.value === undefined) {
    return {
      service: current.service,
      signal,
      observed,
      threshold: relativeThreshold,
      status: 'normal',
      explanation: `No anomaly decision: ${signal} baseline is unavailable`,
      source: current.source,
    };
  }
  const deviation = baseline.value === 0 ? observed : (observed - baseline.value) / Math.abs(baseline.value);
  const status = Math.abs(deviation) >= relativeThreshold ? 'anomalous' : 'normal';
  return {
    service: current.service,
    signal,
    observed,
    baseline: baseline.value,
    deviation,
    threshold: relativeThreshold,
    status,
    explanation:
      status === 'anomalous'
        ? `${signal} observed at ${String(observed)} versus baseline ${String(baseline.value)} (${(deviation * 100).toFixed(1)}% deviation)`
        : `${signal} is within baseline threshold`,
    source: current.source,
  };
}
export function assessRisk(anomalies: Anomaly[], factors: string[] = []): RiskAssessment {
  const anomalous = anomalies.filter(item => item.status === 'anomalous');
  const allFactors = [...factors, ...anomalous.map(item => `${item.signal} anomaly`)];
  const level =
    anomalous.length >= 2 || factors.length >= 2
      ? 'high'
      : anomalous.length === 1 || factors.length === 1
        ? 'medium'
        : 'low';
  return {
    level,
    factors: allFactors,
    confidence: anomalies.length >= 2 ? 'high' : anomalies.length === 1 ? 'medium' : 'low',
    explanation: allFactors.length
      ? `${level.toUpperCase()} risk because ${allFactors.join(', ')}`
      : 'LOW risk: no anomalous signals were observed',
  };
}
export function calculateBlastRadius(
  service: string,
  graph: ServiceGraph,
): { directly_affected: string[]; downstream_at_risk: string[]; unrelated: string[] } {
  const dependents = graph.getDependents(service).map(node => node.id);
  const related = graph
    .getRelatedNodes(service)
    .map(node => node.id)
    .filter(id => id !== service && !dependents.includes(id));
  return {
    directly_affected: [service],
    downstream_at_risk: dependents,
    unrelated: graph
      .getNodes()
      .map(node => node.id)
      .filter(id => id !== service && !dependents.includes(id) && !related.includes(id)),
  };
}
export function createPrediction(input: {
  id: string;
  current: Telemetry;
  anomalies: Anomaly[];
  risk: RiskAssessment;
  graph: ServiceGraph;
  windowMinutes?: number;
  deploymentObserved?: boolean;
}): Prediction {
  const radius = calculateBlastRadius(input.current.service, input.graph);
  const factors = input.deploymentObserved ? ['recent deployment'] : [];
  return {
    id: input.id,
    service: input.current.service,
    status: 'prediction_created',
    risk: { ...input.risk, factors: [...input.risk.factors, ...factors] },
    anomalies: input.anomalies,
    predicted_window_minutes: input.windowMinutes ?? 15,
    at_risk_services: radius.downstream_at_risk,
    unknowns: ['prediction is not confirmation', 'root cause is not established from anomaly signals alone'],
    created_at: input.current.timestamp,
  };
}
