import { OpenAPIHono } from '@hono/zod-openapi';
import type { ResolvexSettings } from '../resolvex/config';
import type { ILLM } from '@truefoundry/trueforge-core/core/llm/ILLM';
import type { AgentTracing } from '@truefoundry/trueforge-core/core/tracing/AgentTracing';
import type { Logger } from 'winston';
import { executeResolveXInvestigation } from '../resolvex/agentExecution';
import { createDemoServiceGraph } from '../resolvex/graph/serviceGraph';
import { createIncidentService } from '../resolvex/services/incidentService';
import type { IncidentStore } from '../resolvex/store/incidentStore';

function errorResponse(error: unknown, c: any) { const message = error instanceof Error ? error.message : 'ResolveX request failed'; const status = message.includes('not found') ? 404 : message.includes('Approval') || message.includes('approved') ? 409 : 400; return c.json({ error: message }, status); }
export function createResolvexRouter(params: { store: IncidentStore; settings: ResolvexSettings; runtime?: { modelClient: ILLM; tracing: AgentTracing; logger: Logger } }) {
  const router = new OpenAPIHono(); const service = createIncidentService(params.store, params.settings);
  router.post('/incidents', async c => { try { return c.json(service.create(await c.req.json().catch(() => ({})))); } catch (e) { return errorResponse(e, c); } });
  router.get('/incidents', c => c.json(service.list()));
  router.get('/incidents/:id', c => { const incident = service.get(c.req.param('id')); return incident ? c.json(incident) : c.json({ error: 'Incident not found' }, 404); });
  router.get('/incidents/:id/graph', c => { try { return c.json(service.graph(c.req.param('id'))); } catch (e) { return errorResponse(e, c); } });
  router.post('/incidents/:id/investigate', async c => { try { const incident = service.get(c.req.param('id')); if (!incident) return c.json({ error: 'Incident not found' }, 404); if (params.runtime) return c.json(await executeResolveXInvestigation({ incident, ...params.runtime, graph: createDemoServiceGraph() })); return c.json(await service.investigate(c.req.param('id'))); } catch (e) { return errorResponse(e, c); } });
  router.post('/incidents/:id/diagnose', async c => { try { const current = service.get(c.req.param('id')); if (!current) return c.json({ error: 'Incident not found' }, 404); return c.json(current.diagnosis ?? (await service.investigate(c.req.param('id'))).diagnosis); } catch (e) { return errorResponse(e, c); } });
  router.post('/incidents/:id/remediation-plan', c => { try { return c.json(service.createPlan(c.req.param('id'))); } catch (e) { return errorResponse(e, c); } });
  router.post('/incidents/:id/approve', async c => { try { const body = await c.req.json().catch(() => ({})); return c.json(service.approve(c.req.param('id'), body.actor)); } catch (e) { return errorResponse(e, c); } });
  router.post('/incidents/:id/reject', async c => { try { const body = await c.req.json().catch(() => ({})); return c.json(service.reject(c.req.param('id'), body.actor)); } catch (e) { return errorResponse(e, c); } });
  router.post('/incidents/:id/remediate', async c => { try { return c.json(await service.remediate(c.req.param('id'))); } catch (e) { return errorResponse(e, c); } });
  router.get('/incidents/:id/timeline', c => { const incident = service.get(c.req.param('id')); return incident ? c.json(incident.timeline) : c.json({ error: 'Incident not found' }, 404); });
  router.get('/incidents/:id/audit', c => { const incident = service.get(c.req.param('id')); return incident ? c.json(incident.actions) : c.json({ error: 'Incident not found' }, 404); });
  router.post('/incidents/:id/verify', async c => { try { return c.json(await service.verify(c.req.param('id'))); } catch (e) { return errorResponse(e, c); } });
  return router;
}
