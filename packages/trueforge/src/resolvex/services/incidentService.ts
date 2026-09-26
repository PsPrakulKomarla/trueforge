import { randomUUID } from 'node:crypto';
import type { ResolvexSettings } from '../config';
import type { EvidenceRecord, Incident } from '../domain/incident';
import { assertTransition } from '../domain/incidentState';
import { approvalRequirement } from '../policies/approvalPolicy';
import type { IncidentStore } from '../store/incidentStore';
import { createDemoEnvironment, createDemoTools } from '../tools/demoTools';
import { createDevOpsToolRegistry, type ToolContext } from '../tools/devopsTool';

const now = () => new Date().toISOString();
export function createIncidentService(store: IncidentStore, settings: ResolvexSettings) {
  const registry = createDevOpsToolRegistry();
  const environment = createDemoEnvironment();
  for (const tool of createDemoTools(environment)) registry.register(tool);
  const change = (id: string, fn: (i: Incident) => void) =>
    store.update(id, i => {
      fn(i);
      i.version++;
      i.updated_at = now();
      return i;
    });
  const event = (
    i: Incident,
    kind: Incident['timeline'][number]['kind'],
    message: string,
    data?: Record<string, unknown>,
  ) => {
    const at = now();
    i.timeline.push({ at, kind, message, actor: 'system', correlation_id: i.correlation_id, data });
    i.actions.push({
      at,
      actor: 'system',
      incident_id: i.id,
      action: kind,
      result: data,
      status: 'ok',
      correlation_id: i.correlation_id,
    });
  };
  const ctx = (i: Incident): ToolContext => ({
    incidentId: i.id,
    correlationId: i.correlation_id,
    tenantId: 'demo',
    signal: new AbortController().signal,
  });
  const invoke = async (i: Incident, id: string, args: Record<string, unknown>) => {
    const tool = registry.get(id);
    if (!tool) throw new Error(`Unknown tool: ${id}`);
    const result = await tool.execute(args, ctx(i));
    const at = now();
    i.actions.push({
      at,
      actor: 'system',
      incident_id: i.id,
      action: id,
      tool: id,
      input: args,
      result: result.output,
      risk: tool.risk,
      status: 'ok',
      correlation_id: i.correlation_id,
    });
    return result;
  };
  return {
    create(input: Partial<Pick<Incident, 'title' | 'description' | 'severity' | 'service' | 'source'>> = {}) {
      const at = now();
      const id = `inc-${randomUUID()}`;
      const incident: Incident = {
        id,
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
      };
      event(incident, 'detected', 'Incident created');
      return store.create(incident);
    },
    get: (id: string) => store.get(id),
    list: () => store.list(),
    async investigate(id: string) {
      let current = store.get(id);
      if (!current) throw new Error('Incident not found');
      assertTransition(current.state, 'investigating');
      change(id, i => {
        i.state = 'investigating';
        event(i, 'state_changed', 'Investigation started');
      });
      current = store.get(id)!;
      const specs: [string, string, EvidenceRecord['kind'], Record<string, unknown>][] = [
        ['get_service_health', 'Service health', 'health', {}],
        ['get_recent_logs', 'Recent application logs', 'log', {}],
        ['get_recent_deployment', 'Recent deployment', 'deployment', {}],
      ];
      for (const [tool, summary, kind, args] of specs) {
        const result = await invoke(current, tool, { service: current.service, ...args });
        change(id, i => {
          i.evidence.push({
            id: `ev-${randomUUID()}`,
            kind,
            source: 'demo',
            collector: tool,
            observed_at: now(),
            summary,
            data: result.output,
          });
          event(i, 'evidence_collected', result.summary, result.output);
        });
        current = store.get(id)!;
      }
      change(id, i => {
        assertTransition(i.state, 'diagnosed');
        i.state = 'diagnosed';
        i.diagnosis = {
          summary: `${i.service} became unhealthy after the latest deployment and is experiencing elevated application errors.`,
          root_cause: 'The latest deployment introduced application/database errors.',
          root_cause_evidence_ids: i.evidence.map(e => e.id),
          hypotheses: [
            {
              id: 'hyp-1',
              statement: 'Latest deployment caused the outage',
              evidence_ids: i.evidence.map(e => e.id),
              confidence: 0.96,
              refuted: false,
            },
          ],
          confidence: 0.96,
          model: 'deterministic-demo',
          generated_at: now(),
        };
        event(i, 'diagnosis_generated', i.diagnosis.summary);
      });
      return this.createPlan(id);
    },
    createPlan(id: string) {
      return change(id, i => {
        assertTransition(i.state, 'remediation_pending');
        i.state = 'remediation_pending';
        i.plan = {
          id: `plan-${randomUUID()}`,
          steps: [
            {
              id: 'step-1',
              tool: 'execute_safe_remediation',
              args: { service: i.service, deployment: 'deploy-2025-01-15-rollback-candidate' },
              reason: 'Rollback the latest deployment implicated by the diagnosis.',
              risk: 'medium',
              expected: 'Service returns to healthy state.',
              status: 'pending',
            },
          ],
          status: 'draft',
          created_at: now(),
        };
        event(i, 'plan_created', 'Rollback the latest deployment.');
        if (approvalRequirement('medium', settings) === 'explicit') {
          assertTransition(i.state, 'approval_required');
          i.state = 'approval_required';
          i.plan.status = 'awaiting_approval';
          const approval = {
            id: `approval-${randomUUID()}`,
            plan_id: i.plan.id,
            requested_at: now(),
            risk: 'medium' as const,
            reason: 'Rollback changes production deployment state.',
          };
          i.approvals.push(approval);
          event(i, 'approval_requested', approval.reason, { approval_id: approval.id });
        }
      });
    },
    approve(id: string, actor = 'demo-user') {
      return change(id, i => {
        if (i.state !== 'approval_required' || !i.plan) throw new Error('Approval is not pending');
        assertTransition(i.state, 'remediating');
        const approval = i.approvals.at(-1)!;
        approval.decision = 'approved';
        approval.decided_at = now();
        approval.decided_by = actor;
        i.plan.status = 'approved';
        i.state = 'remediating';
        event(i, 'approval_decided', 'Remediation approved', { approval_id: approval.id });
      });
    },
    reject(id: string, actor = 'demo-user') {
      return change(id, i => {
        if (i.state !== 'approval_required') throw new Error('Approval is not pending');
        const approval = i.approvals.at(-1)!;
        approval.decision = 'rejected';
        approval.decided_at = now();
        approval.decided_by = actor;
        if (i.plan) i.plan.status = 'rejected';
        assertTransition(i.state, 'cancelled');
        i.state = 'cancelled';
        event(i, 'approval_decided', 'Remediation rejected', { approval_id: approval.id });
      });
    },
    async remediate(id: string) {
      const i = store.get(id);
      if (!i || i.state !== 'remediating' || !i.plan) throw new Error('Incident is not approved for remediation');
      const result = await invoke(i, 'execute_safe_remediation', i.plan.steps[0].args);
      change(id, x => {
        x.plan!.steps[0].status = 'succeeded';
        x.plan!.steps[0].result = result.output;
        x.plan!.status = 'done';
        event(x, 'step_executed', result.summary);
        assertTransition(x.state, 'verifying');
        x.state = 'verifying';
      });
      return this.verify(id);
    },
    async verify(id: string) {
      const i = store.get(id);
      if (!i) throw new Error('Incident not found');
      const result = await invoke(i, 'verify_recovery', { service: i.service });
      const passed = result.output.status === 'healthy';
      change(id, x => {
        x.verification = {
          status: passed ? 'passed' : 'failed',
          attempts: (x.verification?.attempts ?? 0) + 1,
          checks: [
            {
              id: 'check-health',
              name: 'Service health',
              kind: 'health',
              target: x.service,
              passed,
              detail: result.summary,
              observed_at: now(),
            },
          ],
        };
        event(x, 'verification_run', result.summary, result.output);
        if (passed) {
          assertTransition(x.state, 'resolved');
          x.state = 'resolved';
          event(x, 'report_generated', 'Incident resolved');
        }
      });
      return store.get(id)!;
    },
  };
}
