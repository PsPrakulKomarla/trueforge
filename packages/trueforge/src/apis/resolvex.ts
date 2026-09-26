import { OpenAPIHono, type RouteHandler } from '@hono/zod-openapi';
import type { ResolveRequestContext } from '../auth/identity';
import type { ResolvexSettings } from '../resolvex/config';
import type { Incident } from '../resolvex/domain/incident';
import { IllegalIncidentTransitionError } from '../resolvex/domain/incidentState';
import { createDemoServiceGraph } from '../resolvex/graph/demoTopology';
import type { GraphStore } from '../resolvex/graph/graphStore';
import { createIncidentService } from '../resolvex/services/incidentService';
import { IncidentNotFoundError, IncidentStoreConflictError, type IncidentStore } from '../resolvex/store/incidentStore';
import {
  approveResolvexIncidentRoute,
  createResolvexIncidentRoute,
  createResolvexRemediationPlanRoute,
  getResolvexIncidentGraphRoute,
  getResolvexIncidentRoute,
  investigateResolvexIncidentRoute,
  listResolvexIncidentsRoute,
  rejectResolvexIncidentRoute,
  remediateResolvexIncidentRoute,
  verifyResolvexIncidentRoute,
} from '../routes/resolvexRoutes';
import type { CreateResolvexIncidentRequest } from '../schemas/resolvex';

type IncidentService = ReturnType<typeof createIncidentService>;

interface ResolvexRuntime {
  service: IncidentService;
  graph: Awaited<ReturnType<GraphStore['load']>>;
  is_demo: boolean;
}

export interface ResolvexRouterDeps {
  resolveRequestContext: ResolveRequestContext;
  resolveIncidentStore: (tenant_id: string) => IncidentStore;
  resolveGraphStore: (tenant_id: string) => GraphStore;
  settings: ResolvexSettings;
}

export function createResolvexRouter(deps: ResolvexRouterDeps) {
  const runtimeFor = async (tenantId: string): Promise<ResolvexRuntime> => {
    const graphStore = deps.resolveGraphStore(tenantId);
    let graph = await graphStore.load();
    let isDemo = graph.getNodes().some(node => node.metadata?.['source'] === 'deterministic-demo');
    if (graph.nodes.size === 0 && deps.settings.demoEnabled) {
      graph = createDemoServiceGraph();
      await graphStore.save(graph);
      isDemo = true;
    }
    return {
      service: createIncidentService(deps.resolveIncidentStore(tenantId), deps.settings, graph, tenantId),
      graph,
      is_demo: isDemo,
    };
  };

  const router = new OpenAPIHono();
  const createHandler: RouteHandler<typeof createResolvexIncidentRoute> = async c => {
    const body: CreateResolvexIncidentRequest | undefined = c.req.valid('json');
    const tenantId = deps.resolveRequestContext(c).tenant_id;
    const { service } = await runtimeFor(tenantId);
    const incident = await service.create({
      ...(body.title === undefined ? {} : { title: body.title }),
      ...(body.description === undefined ? {} : { description: body.description }),
      ...(body.severity === undefined ? {} : { severity: body.severity }),
      ...(body.service === undefined ? {} : { service: body.service }),
      ...(body.source === undefined ? {} : { source: body.source }),
    });
    return c.json({ data: incident }, 201);
  };
  const listHandler: RouteHandler<typeof listResolvexIncidentsRoute> = async c => {
    const { service } = await runtimeFor(deps.resolveRequestContext(c).tenant_id);
    return c.json({ data: await service.list() }, 200);
  };
  const getHandler: RouteHandler<typeof getResolvexIncidentRoute> = async c => {
    const { incident_id: id } = c.req.valid('param');
    const { service } = await runtimeFor(deps.resolveRequestContext(c).tenant_id);
    const incident = await service.get(id);
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
    const requestContext = deps.resolveRequestContext(c);
    const { service } = await runtimeFor(requestContext.tenant_id);
    const incident = await service.get(id);
    if (incident === undefined) {
      return c.json({ error: { message: `Incident not found: ${id}` } }, 404);
    }
    try {
      return c.json({ data: await operation(service, incident, id) }, 200);
    } catch (error) {
      if (error instanceof IllegalIncidentTransitionError || error instanceof IncidentStoreConflictError) {
        return c.json({ error: { message: error.message } }, 409);
      }
      if (error instanceof IncidentNotFoundError) {
        return c.json({ error: { message: error.message } }, 404);
      }
      throw error;
    }
  };

  router.openapi(createResolvexIncidentRoute, createHandler);
  router.openapi(listResolvexIncidentsRoute, listHandler);
  router.openapi(getResolvexIncidentRoute, getHandler);
  router.openapi(getResolvexIncidentGraphRoute, async c => {
    const { incident_id: id } = c.req.valid('param');
    const tenantId = deps.resolveRequestContext(c).tenant_id;
    const { service, graph, is_demo } = await runtimeFor(tenantId);
    const incident = await service.get(id);
    if (incident === undefined) {
      return c.json({ error: { message: `Incident not found: ${id}` } }, 404);
    }
    const relatedNodes = graph.getRelatedNodes(incident.service).filter(node => node.id !== incident.service);
    return c.json(
      {
        data: {
          incident_id: incident.id,
          is_demo,
          affected_node: graph.getNode(incident.service) ?? null,
          dependencies: graph.getDependencies(incident.service),
          dependents: graph.getDependents(incident.service),
          related_nodes: relatedNodes,
          nodes: graph.getNodes(),
          edges: graph.toJSON().edges,
        },
      },
      200,
    );
  });
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
      return service.remediate(id, deps.resolveRequestContext(c).subject.id);
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
      return service.verify(id, deps.resolveRequestContext(c).subject.id);
    }),
  );
  return router;
}
