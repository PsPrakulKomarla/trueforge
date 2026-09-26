import type { ILLM } from '@truefoundry/trueforge-core/core';
import { z } from 'zod';
import { createResolvexRouter } from '../../src/apis/resolvex';
import { STANDALONE_REQUEST_CONTEXT } from '../../src/auth/identity';
import { createResolvexAgentDefinition } from '../../src/resolvex/agent';
import { createDemoServiceGraph } from '../../src/resolvex/graph/demoTopology';
import { createInMemoryGraphStore } from '../../src/resolvex/graph/graphStore';
import { createInMemoryIncidentStore } from '../../src/resolvex/store/incidentStore';
import { createDemoEnvironment, createDemoTools } from '../../src/resolvex/tools/demoTools';
import { createDevOpsToolRegistry, defineDevOpsTool, type ToolContext } from '../../src/resolvex/tools/devopsTool';
import { createResolvexToolMCP } from '../../src/resolvex/tools/registryAdapter';
import {
  GetResolvexIncidentGraphResponseSchema,
  GetResolvexIncidentResponseSchema,
  ListResolvexIncidentsResponseSchema,
} from '../../src/schemas/resolvex';

const settings = {
  enabled: true,
  modelName: undefined,
  confidenceThreshold: 0.7,
  maxVerificationAttempts: 3,
  requireApproval: true,
  demoEnabled: true,
};

function jsonRequest(method: 'GET' | 'POST', body?: unknown): RequestInit {
  return {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  };
}

describe('ResolveX Phase 2 integration', () => {
  test('API exposes the incident lifecycle and scopes records by tenant', async () => {
    let tenantId = 'tenant-a';
    const incidentStores = new Map<string, ReturnType<typeof createInMemoryIncidentStore>>();
    const graphStores = new Map<string, ReturnType<typeof createInMemoryGraphStore>>();
    const router = createResolvexRouter({
      settings,
      resolveRequestContext: () => ({ ...STANDALONE_REQUEST_CONTEXT, tenant_id: tenantId }),
      resolveIncidentStore: tenant => {
        let store = incidentStores.get(tenant);
        if (store === undefined) {
          store = createInMemoryIncidentStore();
          incidentStores.set(tenant, store);
        }
        return store;
      },
      resolveGraphStore: tenant => {
        let store = graphStores.get(tenant);
        if (store === undefined) {
          store = createInMemoryGraphStore(createDemoServiceGraph());
          graphStores.set(tenant, store);
        }
        return store;
      },
    });

    const createdResponse = await router.request(
      '/incidents',
      jsonRequest('POST', { service: 'payment-api', title: 'Payment errors' }),
    );
    expect(createdResponse.status).toBe(201);
    const created = GetResolvexIncidentResponseSchema.parse(await createdResponse.json()).data;
    expect(created.state).toBe('detected');

    const graphResponse = await router.request(`/incidents/${created.id}/graph`);
    const graph = GetResolvexIncidentGraphResponseSchema.parse(await graphResponse.json()).data;
    expect(graph.affected_node?.id).toBe('payment-api');
    expect(graph.dependencies.map(node => node.id)).toContain('payment-db');
    expect(graph.is_demo).toBe(true);

    const listResponse = await router.request('/incidents');
    expect(listResponse.status).toBe(200);
    const list = ListResolvexIncidentsResponseSchema.parse(await listResponse.json());
    expect(list.data.map(incident => incident.id)).toContain(created.id);

    const getResponse = await router.request(`/incidents/${created.id}`);
    expect(GetResolvexIncidentResponseSchema.parse(await getResponse.json()).data.id).toBe(created.id);
    expect((await router.request('/incidents/missing')).status).toBe(404);
    expect((await router.request('/incidents', jsonRequest('POST', { severity: 'not-a-severity' }))).status).toBe(400);

    expect((await router.request(`/incidents/${created.id}/remediation-plan`, jsonRequest('POST'))).status).toBe(409);

    const investigatedResponse = await router.request(`/incidents/${created.id}/investigate`, jsonRequest('POST'));
    const investigated = GetResolvexIncidentResponseSchema.parse(await investigatedResponse.json()).data;
    expect(investigated.state).toBe('approval_required');
    expect(investigated.evidence).toHaveLength(4);
    expect(investigated.evidence.find(evidence => evidence.kind === 'graph')?.summary).toContain('dependencies');
    expect(investigated.graph_evidence.map(evidence => evidence.node_id)).toContain('payment-db');
    expect(investigated.state).toBe('approval_required');

    const planResponse = await router.request(`/incidents/${created.id}/remediation-plan`, jsonRequest('POST'));
    expect(GetResolvexIncidentResponseSchema.parse(await planResponse.json()).data.plan?.id).toBe(
      investigated.plan?.id,
    );

    const approvedResponse = await router.request(`/incidents/${created.id}/approve`, jsonRequest('POST'));
    expect(GetResolvexIncidentResponseSchema.parse(await approvedResponse.json()).data.state).toBe('remediating');

    const remediatedResponse = await router.request(`/incidents/${created.id}/remediate`, jsonRequest('POST'));
    const remediated = GetResolvexIncidentResponseSchema.parse(await remediatedResponse.json()).data;
    expect(remediated.state).toBe('resolved');
    expect(remediated.verification?.status).toBe('passed');

    const verifiedResponse = await router.request(`/incidents/${created.id}/verify`, jsonRequest('POST'));
    expect(GetResolvexIncidentResponseSchema.parse(await verifiedResponse.json()).data.state).toBe('resolved');

    const rejectedIncident = GetResolvexIncidentResponseSchema.parse(
      await (await router.request('/incidents', jsonRequest('POST'))).json(),
    ).data;
    await router.request(`/incidents/${rejectedIncident.id}/investigate`, jsonRequest('POST'));
    const rejectedResponse = await router.request(`/incidents/${rejectedIncident.id}/reject`, jsonRequest('POST'));
    expect(GetResolvexIncidentResponseSchema.parse(await rejectedResponse.json()).data.state).toBe('cancelled');

    tenantId = 'tenant-b';
    expect((await router.request(`/incidents/${created.id}`)).status).toBe(404);
  });

  test('tool adapter exposes registry tools and fail-closes mutating calls', async () => {
    const registry = createDevOpsToolRegistry();
    const environment = createDemoEnvironment();
    for (const tool of createDemoTools(environment)) {
      registry.register(tool);
    }
    const context: ToolContext = {
      incidentId: 'inc-test',
      correlationId: 'corr-test',
      tenantId: 'tenant-test',
      signal: new AbortController().signal,
    };
    const mcp = createResolvexToolMCP({ registry, settings, context: () => context });
    const listed = await mcp.listTools();
    if (!('result' in listed)) {
      throw new Error('Expected local tool listing');
    }
    expect(listed.result.tools.map(tool => tool.name)).toEqual([
      'get_service_health',
      'get_recent_logs',
      'get_recent_deployment',
      'inspect_repository',
      'execute_safe_remediation',
      'verify_recovery',
    ]);

    const readResult = await mcp.callTool({ name: 'get_service_health', arguments: { service: 'payment-api' } });
    expect('result' in readResult && readResult.result.isError).toBeFalsy();
    const pending = await mcp.callTool({
      name: 'execute_safe_remediation',
      arguments: { service: 'payment-api', deployment: 'deploy-test' },
    });
    expect('approvalRequired' in pending).toBe(true);
    expect(environment.healthy.has('payment-api')).toBe(false);
    expect((await mcp.toolCallInfo({ name: 'execute_safe_remediation' })).is_approval_required).toBe(true);

    const denied = await mcp.callTool(
      { name: 'execute_safe_remediation', arguments: { service: 'payment-api' } },
      { status: 'deny', reason: 'Not approved' },
    );
    expect('result' in denied && denied.result.isError).toBe(true);
    expect(environment.healthy.has('payment-api')).toBe(false);

    const allowed = await mcp.callTool(
      { name: 'execute_safe_remediation', arguments: { service: 'payment-api' } },
      { status: 'allow' },
    );
    expect('result' in allowed && allowed.result.isError).toBeFalsy();
    expect(environment.healthy.has('payment-api')).toBe(true);
  });

  test('tool adapter returns safe errors and the agent definition carries its tool set and instructions', async () => {
    const registry = createDevOpsToolRegistry();
    registry.register(
      defineDevOpsTool({
        id: 'failing_tool',
        name: 'Failing tool',
        description: 'Always fails.',
        category: 'diagnostics',
        risk: 'low',
        schema: z.object({}),
        execute: () => Promise.reject(new Error('sensitive integration detail')),
      }),
    );
    const context: ToolContext = {
      incidentId: 'inc-test',
      correlationId: 'corr-test',
      tenantId: 'tenant-test',
      signal: new AbortController().signal,
    };
    const mcp = createResolvexToolMCP({ registry, settings, context: () => context });
    const failure = await mcp.callTool({ name: 'failing_tool', arguments: {} });
    expect('result' in failure && failure.result.isError).toBe(true);
    if ('result' in failure) {
      expect(failure.result.content).toEqual([
        { type: 'text', text: JSON.stringify({ error: 'Tool execution failed' }) },
      ]);
    }

    const modelClient: ILLM = { create: jest.fn(), createNonStream: jest.fn() };
    const definition = createResolvexAgentDefinition({
      modelClient,
      toolSet: mcp,
      graphContext: {
        affected_service: 'payment-api',
        dependencies: ['payment-db'],
        dependents: ['checkout-api'],
        related_services: [],
        nodes: [{ id: 'payment-db', type: 'database', name: 'payment-db' }],
        edges: [{ source: 'payment-api', target: 'payment-db', relationship: 'depends_on' }],
      },
    });
    expect(definition.modelClient).toBe(modelClient);
    expect(definition.toolSets).toEqual([mcp]);
    expect(definition.instruction).toContain('graph connectivity does not establish causation');
    expect(definition.instruction).toContain('request human approval');
    expect(definition.instruction).toContain('never claim recovery without a passing verification result');
    expect(definition.instruction).toContain('payment-db');
  });
});
