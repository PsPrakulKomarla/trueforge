import { buildRecommendation, similarity } from '../../../src/resolvex/services/incidentMemory';
import { createDemoServiceGraph } from '../../../src/resolvex/graph/demoTopology';
import type { Incident } from '../../../src/resolvex/domain/incident';

const incident = (id: string, service: string): Incident => ({ id, title: 'test', description: '', severity: 'high', state: 'resolved', source: 'test', service, detected_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:01:00.000Z', version: 0, correlation_id: id, evidence: [{ id: 'log', kind: 'log', source: 'demo', collector: 'logs', observed_at: '2026-01-01T00:00:00.000Z', summary: 'timeout', data: { error_signature: 'timeout' } }], timeline: [], diagnosis: null, plan: null, approvals: [], verification: null, actions: [] });
test('similarity explains matching evidence and service', () => { const result = similarity(incident('a', 'payment-api'), incident('b', 'payment-api'), createDemoServiceGraph()); expect(result?.signals).toEqual(expect.arrayContaining(['same_service', 'matching_error_signature'])); });
test('recommendations are evidence-derived and not authorization', () => { expect(buildRecommendation(incident('a', 'payment-api'), [])).toBeUndefined(); });
