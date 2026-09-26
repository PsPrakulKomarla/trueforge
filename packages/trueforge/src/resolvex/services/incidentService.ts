import { randomUUID } from 'node:crypto';
import type { ResolvexSettings } from '../config';
import type { EvidenceRecord, GraphEvidence, Incident } from '../domain/incident';
import { assertTransition } from '../domain/incidentState';
import type { ServiceGraph } from '../graph/serviceGraph';
import { approvalRequirement } from '../policies/approvalPolicy';
import { IncidentNotFoundError, type IncidentStore } from '../store/incidentStore';
import { createDemoEnvironment, createDemoTools } from '../tools/demoTools';
import { createDevOpsToolRegistry, type ToolContext } from '../tools/devopsTool';

const now = () => new Date().toISOString();

/** Graph relationships add investigation context, but never confirm a root cause. */
export function createIncidentService(
  store: IncidentStore,
  settings: ResolvexSettings,
  graph?: ServiceGraph,
  tenantId = 'demo',
) {
  const registry = createDevOpsToolRegistry();
  const environment = createDemoEnvironment();
  for (const tool of createDemoTools(environment)) {
    registry.register(tool);
  }

  const change = (id: string, update: (incident: Incident) => void) =>
    store.update(id, incident => {
      update(incident);
      incident.version++;
      incident.updated_at = now();
      return incident;
    });

  const event = (
    incident: Incident,
    kind: Incident['timeline'][number]['kind'],
    message: string,
    data?: Record<string, unknown>,
    actor = 'system',
  ) => {
    const at = now();
    incident.timeline.push({
      at,
      kind,
      message,
      actor,
      correlation_id: incident.correlation_id,
      ...(data === undefined ? {} : { data }),
    });
    incident.actions.push({
      at,
      actor,
      incident_id: incident.id,
      action: kind,
      status: 'ok',
      correlation_id: incident.correlation_id,
      ...(data === undefined ? {} : { result: data }),
    });
  };

  const context = (incident: Incident): ToolContext => ({
    incidentId: incident.id,
    correlationId: incident.correlation_id,
    tenantId,
    signal: new AbortController().signal,
  });

  const invoke = async (incident: Incident, toolId: string, args: Record<string, unknown>, actor = 'system') => {
    const tool = registry.get(toolId);
    if (tool === undefined) {
      throw new Error(`Unknown tool: ${toolId}`);
    }
    try {
      const result = await Promise.race([tool.execute(args, context(incident)), new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Tool ${tool.id} timed out after ${String(tool.timeoutMs)}ms`)), tool.timeoutMs))]);
      await change(incident.id, current => {
        current.actions.push({
          at: now(),
          actor,
          incident_id: current.id,
          action: toolId,
          tool: toolId,
          input: args,
          result: result.output,
          risk: tool.risk,
          status: 'ok',
          correlation_id: current.correlation_id,
        });
      });
      return result;
    } catch (error) {
      await change(incident.id, current => {
        const message = error instanceof Error ? error.message : 'Tool execution failed';
        current.actions.push({
          at: now(),
          actor,
          incident_id: current.id,
          action: toolId,
          tool: toolId,
          input: args,
          risk: tool.risk,
          status: 'error',
          correlation_id: current.correlation_id,
          result: { error: message },
        });
        event(current, 'error', `${toolId} failed`, { error: message }, actor);
      });
      throw error;
    }
  };

  return {
    async create(
      input: Partial<Pick<Incident, 'title' | 'description' | 'severity' | 'service' | 'source'>> = {},
    ): Promise<Incident> {
      const at = now();
      const incident: Incident = {
        id: `inc-${randomUUID()}`,
        title: input.title ?? 'payment-api unhealthy',
        description: input.description ?? 'Payment service health check is failing.',
        severity: input.severity ?? 'high',
        state: 'detected',
        source: input.source ?? 'demo-monitor',
        service: input.service ?? 'payment-api',
        detected_at: at,
        updated_at: at,
        version: 0,
        correlation_id: randomUUID(),
        evidence: [],
        timeline: [],
        diagnosis: null,
        plan: null,
        approvals: [],
        verification: null,
        actions: [],
        priority: 0,
        graph_evidence: [],
      };
      event(incident, 'detected', 'Incident created');
      return store.create(incident);
    },
    get: (id: string) => store.get(id),
    list: () => store.list(),
    async investigate(id: string): Promise<Incident> {
      let current = await store.get(id);
      if (current === undefined) {
        throw new IncidentNotFoundError(id);
      }
      assertTransition(current.state, 'investigating');
      current = await change(id, incident => {
        incident.state = 'investigating';
        event(incident, 'state_changed', 'Investigation started', undefined, 'agent:resolvex');
      });

      const tools: [string, string, EvidenceRecord['kind']][] = [
        ['get_service_health', 'Service health', 'health'],
        ['get_recent_logs', 'Recent application logs', 'log'],
        ['get_recent_deployment', 'Recent deployment', 'deployment'],
      ];
      for (const [toolId, summary, kind] of tools) {
        const result = await invoke(current, toolId, { service: current.service }, 'agent:resolvex');
        current = await change(id, incident => {
          incident.evidence.push({
            id: `ev-${randomUUID()}`,
            kind,
            source: 'demo',
            collector: toolId,
            observed_at: now(),
            summary,
            data: result.output,
          });
          event(incident, 'evidence_collected', result.summary, result.output, 'agent:resolvex');
        });
      }

      if (graph !== undefined) {
        const affectedService = current.service;
        const dependencies = graph.getDependencies(affectedService);
        const dependents = graph.getDependents(affectedService);
        const relatedNodes = graph.getRelatedNodes(affectedService).filter(node => node.id !== affectedService);
        const graphEvidence: GraphEvidence[] = [];
        const edges = graph.toJSON().edges;
        for (const node of [...dependencies, ...dependents, ...relatedNodes]) {
          if (graphEvidence.some(evidence => evidence.node_id === node.id)) {
            continue;
          }
          const edge = edges.find(
            candidate =>
              (candidate.source === affectedService && candidate.target === node.id) ||
              (candidate.target === affectedService && candidate.source === node.id),
          );
          graphEvidence.push({
            node_id: node.id,
            node_type: node.type,
            relationship: edge?.relationship ?? 'related',
            direction: dependencies.some(dependency => dependency.id === node.id)
              ? 'dependency'
              : dependents.some(dependent => dependent.id === node.id)
                ? 'dependent'
                : 'related',
            data: {
              name: node.name,
              ...(node.metadata === undefined ? {} : { metadata: node.metadata }),
            },
          });
        }
        current = await change(id, incident => {
          const record: EvidenceRecord = {
            id: `ev-graph-${randomUUID()}`,
            kind: 'graph',
            source: 'service-graph',
            collector: 'graph-query',
            observed_at: now(),
            summary: `Graph context for ${incident.service}: ${String(dependencies.length)} dependencies, ${String(dependents.length)} dependents, ${String(relatedNodes.length)} related nodes`,
            data: {
              service: incident.service,
              dependencies: dependencies.map(node => ({ id: node.id, type: node.type, name: node.name })),
              dependents: dependents.map(node => ({ id: node.id, type: node.type, name: node.name })),
              related_nodes: relatedNodes.map(node => ({ id: node.id, type: node.type, name: node.name })),
              relationships: edges.filter(edge => edge.source === incident.service || edge.target === incident.service),
            },
          };
          incident.evidence.push(record);
          incident.graph_evidence = graphEvidence;
          event(incident, 'evidence_collected', record.summary, record.data, 'agent:resolvex');
        });
      }

      current = await change(id, incident => {
        assertTransition(incident.state, 'diagnosed');
        const evidenceIds = incident.evidence
          .filter(evidence => evidence.kind === 'health' || evidence.kind === 'log' || evidence.kind === 'deployment')
          .map(evidence => evidence.id);
        incident.state = 'diagnosed';
        incident.diagnosis = {
          summary: `${incident.service} is unhealthy with recent application errors and a recent deployment.`,
          root_cause: 'The latest deployment is associated with application and database errors.',
          root_cause_evidence_ids: evidenceIds,
          hypotheses: [
            {
              id: 'hyp-1',
              statement: 'The latest deployment is associated with the outage',
              evidence_ids: evidenceIds,
              confidence: 0.96,
              refuted: false,
            },
          ],
          confidence: 0.96,
          model: 'deterministic-demo',
          generated_at: now(),
        };
        event(incident, 'diagnosis_generated', incident.diagnosis.summary, undefined, 'agent:resolvex');
      });
      return this.createPlan(id);
    },
    async createPlan(id: string): Promise<Incident> {
      return change(id, incident => {
        assertTransition(incident.state, 'remediation_pending');
        incident.state = 'remediation_pending';
        incident.plan = {
          id: `plan-${randomUUID()}`,
          steps: [
            {
              id: 'step-1',
              tool: 'execute_safe_remediation',
              args: { service: incident.service, deployment: 'deploy-2025-01-15-rollback-candidate' },
              reason: 'Rollback the latest deployment implicated by the operational evidence.',
              risk: 'medium',
              expected: 'Service returns to healthy state.',
              status: 'pending',
            },
          ],
          status: 'draft',
          created_at: now(),
        };
        event(incident, 'plan_created', 'Rollback the latest deployment.', undefined, 'agent:resolvex');
        if (approvalRequirement('medium', settings) === 'explicit') {
          assertTransition(incident.state, 'approval_required');
          incident.state = 'approval_required';
          incident.plan.status = 'awaiting_approval';
          const approval = {
            id: `approval-${randomUUID()}`,
            plan_id: incident.plan.id,
            requested_at: now(),
            risk: 'medium' as const,
            reason: 'Rollback changes production deployment state.',
          };
          incident.approvals.push(approval);
          event(incident, 'approval_requested', approval.reason, { approval_id: approval.id }, 'agent:resolvex');
        }
      });
    },
    async approve(id: string, actor = 'demo-user'): Promise<Incident> {
      return change(id, incident => {
        if (incident.state !== 'approval_required' || incident.plan === null) {
          throw new Error('Approval is not pending');
        }
        assertTransition(incident.state, 'remediating');
        const approval = incident.approvals.at(-1);
        if (approval === undefined) {
          throw new Error('Approval record is missing');
        }
        approval.decision = 'approved';
        approval.decided_at = now();
        approval.decided_by = actor;
        incident.plan.status = 'approved';
        incident.state = 'remediating';
        event(incident, 'approval_decided', 'Remediation approved', { approval_id: approval.id }, actor);
      });
    },
    async reject(id: string, actor = 'demo-user'): Promise<Incident> {
      return change(id, incident => {
        if (incident.state !== 'approval_required') {
          throw new Error('Approval is not pending');
        }
        const approval = incident.approvals.at(-1);
        if (approval === undefined) {
          throw new Error('Approval record is missing');
        }
        approval.decision = 'rejected';
        approval.decided_at = now();
        approval.decided_by = actor;
        if (incident.plan !== null) {
          incident.plan.status = 'rejected';
        }
        assertTransition(incident.state, 'cancelled');
        incident.state = 'cancelled';
        event(incident, 'approval_decided', 'Remediation rejected', { approval_id: approval.id }, actor);
      });
    },
    async remediate(id: string, actor = 'system'): Promise<Incident> {
      const incident = await store.get(id);
      if (incident === undefined) {
        throw new IncidentNotFoundError(id);
      }
      const plan = incident.plan;
      const step = plan?.steps[0];
      if (incident.state !== 'remediating' || plan === null || step === undefined || plan.status !== 'approved') {
        throw new Error('Incident is not approved for remediation');
      }
      if (step.status === 'succeeded' || plan.status === 'done') {
        return incident;
      }
      const result = await invoke(incident, 'execute_safe_remediation', step.args, actor);
      await change(id, current => {
        const currentPlan = current.plan;
        const currentStep = currentPlan?.steps[0];
        if (currentPlan === null || currentStep === undefined) {
          throw new Error('Approved remediation plan is missing');
        }
        currentStep.status = 'succeeded';
        currentStep.finished_at = now();
        currentStep.result = result.output;
        currentPlan.status = 'done';
        event(current, 'step_executed', result.summary, result.output, actor);
        assertTransition(current.state, 'verifying');
        current.state = 'verifying';
        event(current, 'state_changed', 'Remediation completed; verification started', undefined, actor);
      });
      return this.verify(id, actor);
    },
    async verify(id: string, actor = 'system'): Promise<Incident> {
      const incident = await store.get(id);
      if (incident === undefined) {
        throw new IncidentNotFoundError(id);
      }
      if (incident.state !== 'verifying') {
        assertTransition(incident.state, 'resolved');
      }
      const result = await invoke(incident, 'verify_recovery', { service: incident.service }, actor);
      const passed = result.output['status'] === 'healthy';
      return change(id, current => {
        current.verification = {
          status: passed ? 'passed' : 'failed',
          attempts: (current.verification?.attempts ?? 0) + 1,
          checks: [
            {
              id: 'check-health',
              name: 'Service health',
              kind: 'health',
              target: current.service,
              passed,
              detail: result.summary,
              observed_at: now(),
            },
          ],
        };
        event(current, 'verification_run', result.summary, result.output, actor);
        if (passed) {
          assertTransition(current.state, 'resolved');
          current.state = 'resolved';
          event(current, 'report_generated', 'Incident resolved', undefined, actor);
        }
      });
    },
  };
}
