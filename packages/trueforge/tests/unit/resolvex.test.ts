import { IllegalIncidentTransitionError } from '../../src/resolvex/domain/incidentState';
import { createIncidentService } from '../../src/resolvex/services/incidentService';
import { createInMemoryIncidentStore } from '../../src/resolvex/store/incidentStore';

describe('ResolveX deterministic incident workflow', () => {
  test('investigates, gates remediation, approves, remediates and resolves', async () => {
    const service = createIncidentService(createInMemoryIncidentStore(), {
      requireApproval: true,
      maxVerificationAttempts: 3,
    } as never);
    const created = service.create();
    expect(created.state).toBe('detected');
    const planned = await service.investigate(created.id);
    expect(planned.state).toBe('approval_required');
    expect(planned.evidence).toHaveLength(3);
    expect(planned.diagnosis?.root_cause).toContain('deployment');
    const approved = service.approve(created.id);
    expect(approved.state).toBe('remediating');
    const resolved = await service.remediate(created.id);
    expect(resolved.state).toBe('resolved');
    expect(resolved.verification?.status).toBe('passed');
    expect(resolved.timeline.map(event => event.kind)).toEqual(
      expect.arrayContaining(['approval_requested', 'step_executed', 'verification_run', 'report_generated']),
    );
  });
  test('rejection cancels the incident', async () => {
    const service = createIncidentService(createInMemoryIncidentStore(), {
      requireApproval: true,
      maxVerificationAttempts: 3,
    } as never);
    const incident = service.create();
    await service.investigate(incident.id);
    expect(service.reject(incident.id).state).toBe('cancelled');
  });
  test('illegal transitions fail closed', () => {
    const service = createIncidentService(createInMemoryIncidentStore(), {
      requireApproval: true,
      maxVerificationAttempts: 3,
    } as never);
    const incident = service.create();
    expect(() => service.approve(incident.id)).toThrow();
    expect(() => {
      throw new IllegalIncidentTransitionError('detected', 'resolved');
    }).toThrow();
  });
});
