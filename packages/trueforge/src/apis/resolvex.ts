import { OpenAPIHono, type RouteHandler } from '@hono/zod-openapi';
import type { ResolveRequestContext } from '../auth/identity';
import type { ResolvexSettings } from '../resolvex/config';
import type { Incident } from '../resolvex/domain/incident';
import { IllegalIncidentTransitionError } from '../resolvex/domain/incidentState';
import { createIncidentService } from '../resolvex/services/incidentService';
import { createInMemoryIncidentStore } from '../resolvex/store/incidentStore';
import {
  approveResolvexIncidentRoute,
  createResolvexIncidentRoute,
  createResolvexRemediationPlanRoute,
  getResolvexIncidentRoute,
  investigateResolvexIncidentRoute,
  listResolvexIncidentsRoute,
  rejectResolvexIncidentRoute,
  remediateResolvexIncidentRoute,
  verifyResolvexIncidentRoute,
} from '../routes/resolvexRoutes';
import type { CreateResolvexIncidentRequest } from '../schemas/resolvex';

type IncidentService = ReturnType<typeof createIncidentService>;

export interface ResolvexRouterDeps {
  resolveRequestContext: ResolveRequestContext;
  settings: ResolvexSettings;
}

/** Auth is applied by `createServerApp`; each tenant receives an isolated Phase 2 store. */
export function createResolvexRouter(deps: ResolvexRouterDeps) {
  // ponytail: process-local in-memory tenant stores; replace with the Phase 3 durable store.
  const services = new Map<string, IncidentService>();
  const serviceFor = (tenantId: string): IncidentService => {
    let service = services.get(tenantId);
    if (service === undefined) {
      service = createIncidentService(createInMemoryIncidentStore(), deps.settings);
      services.set(tenantId, service);
    }
    return service;
  };

  const router = new OpenAPIHono();
  const createHandler: RouteHandler<typeof createResolvexIncidentRoute> = c => {
    const body: CreateResolvexIncidentRequest | undefined = c.req.valid('json');
    const tenantId = deps.resolveRequestContext(c).tenant_id;
    const incident = serviceFor(tenantId).create({
      ...(body.title === undefined ? {} : { title: body.title }),
      ...(body.description === undefined ? {} : { description: body.description }),
      ...(body.severity === undefined ? {} : { severity: body.severity }),
      ...(body.service === undefined ? {} : { service: body.service }),
      ...(body.source === undefined ? {} : { source: body.source }),
    });
    return c.json({ data: incident }, 201);
  };
  const listHandler: RouteHandler<typeof listResolvexIncidentsRoute> = c => {
    const tenantId = deps.resolveRequestContext(c).tenant_id;
    return c.json({ data: serviceFor(tenantId).list() }, 200);
  };
  const getHandler: RouteHandler<typeof getResolvexIncidentRoute> = c => {
    const { incident_id: id } = c.req.valid('param');
    const incident = serviceFor(deps.resolveRequestContext(c).tenant_id).get(id);
    if (incident === undefined) {
      return c.json({ error: { message: `Incident not found: ${id}` } }, 404);
    }
    return c.json({ data: incident }, 200);
  };
  const action = async (
    c: Parameters<RouteHandler<typeof investigateResolvexIncidentRoute>>[0],
    operation: (service: IncidentService, incident: Incident, id: string) => Promise<Incident> | Incident,
  ) => {
    const { incident_id: id } = c.req.valid('param');
    const service = serviceFor(deps.resolveRequestContext(c).tenant_id);
    const incident = service.get(id);
    if (incident === undefined) {
      return c.json({ error: { message: `Incident not found: ${id}` } }, 404);
    }
    try {
      return c.json({ data: await operation(service, incident, id) }, 200);
    } catch (error) {
      if (error instanceof IllegalIncidentTransitionError) {
        return c.json({ error: { message: error.message } }, 409);
      }
      throw error;
    }
  };

  router.openapi(createResolvexIncidentRoute, createHandler);
  router.openapi(listResolvexIncidentsRoute, listHandler);
  router.openapi(getResolvexIncidentRoute, getHandler);
  router.openapi(investigateResolvexIncidentRoute, c => action(c, (service, _incident, id) => service.investigate(id)));
  router.openapi(createResolvexRemediationPlanRoute, c =>
    action(c, (service, incident, id) => (incident.plan === null ? service.createPlan(id) : incident)),
  );
  router.openapi(approveResolvexIncidentRoute, c =>
    action(c, (service, incident, id) => {
      if (incident.state !== 'approval_required') {
        throw new IllegalIncidentTransitionError(incident.state, 'remediating');
      }
      return service.approve(id, deps.resolveRequestContext(c).subject.id);
    }),
  );
  router.openapi(rejectResolvexIncidentRoute, c =>
    action(c, (service, incident, id) => {
      if (incident.state !== 'approval_required') {
        throw new IllegalIncidentTransitionError(incident.state, 'cancelled');
      }
      return service.reject(id, deps.resolveRequestContext(c).subject.id);
    }),
  );
  router.openapi(remediateResolvexIncidentRoute, c =>
    action(c, (service, incident, id) => {
      if (incident.state !== 'remediating') {
        throw new IllegalIncidentTransitionError(incident.state, 'verifying');
      }
      return service.remediate(id);
    }),
  );
  router.openapi(verifyResolvexIncidentRoute, c =>
    action(c, (service, incident, id) => {
      if (incident.verification !== null && (incident.state === 'resolved' || incident.state === 'failed')) {
        return incident;
      }
      if (incident.state !== 'verifying') {
        throw new IllegalIncidentTransitionError(incident.state, 'resolved');
      }
      return service.verify(id);
    }),
  );
  return router;
}
