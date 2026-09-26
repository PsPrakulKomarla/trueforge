import type { ResolvexSettings } from '../../../src/resolvex/config';
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  IllegalIncidentTransitionError,
  INCIDENT_TERMINAL_STATES,
  isTerminal,
  type IncidentState,
} from '../../../src/resolvex/domain/incidentState';
import { maxRisk, riskCategory } from '../../../src/resolvex/domain/risk';
import { approvalRequirement, planApprovalRequirement } from '../../../src/resolvex/policies/approvalPolicy';

const settings = (overrides: Partial<ResolvexSettings> = {}): ResolvexSettings => ({
  enabled: true,
  modelName: undefined,
  confidenceThreshold: 0.7,
  maxVerificationAttempts: 3,
  requireApproval: true,
  demoEnabled: true,
  ...overrides,
});

describe('incident state machine', () => {
  test('terminal states are exits-free and marked terminal', () => {
    for (const state of INCIDENT_TERMINAL_STATES) {
      expect(isTerminal(state)).toBe(true);
      expect(allowedTransitions(state)).toHaveLength(0);
    }
  });

  test('the happy path is a legal chain end to end', () => {
    const edges: readonly (readonly [IncidentState, IncidentState])[] = [
      ['detected', 'investigating'],
      ['investigating', 'diagnosed'],
      ['diagnosed', 'remediation_pending'],
      ['remediation_pending', 'approval_required'],
      ['approval_required', 'remediating'],
      ['remediating', 'verifying'],
      ['verifying', 'resolved'],
    ];
    for (const [from, to] of edges) {
      expect(canTransition(from, to)).toBe(true);
      expect(() => {
        assertTransition(from, to);
      }).not.toThrow();
    }
  });

  test('a low-risk plan may skip the approval state', () => {
    expect(canTransition('remediation_pending', 'remediating')).toBe(true);
    expect(canTransition('remediation_pending', 'approval_required')).toBe(true);
  });

  test('failed verification re-enters investigation, closing the loop', () => {
    expect(canTransition('verifying', 'investigating')).toBe(true);
    expect(canTransition('verifying', 'resolved')).toBe(true);
  });

  test('illegal transitions throw with the attempted edge', () => {
    expect(() => {
      assertTransition('detected', 'resolved');
    }).toThrow(IllegalIncidentTransitionError);
    try {
      assertTransition('resolved', 'investigating');
      throw new Error('expected a throw');
    } catch (error) {
      if (!(error instanceof IllegalIncidentTransitionError)) {
        throw error;
      }
      expect(error.from).toBe('resolved');
      expect(error.to).toBe('investigating');
    }
  });
});

describe('risk and approval policy', () => {
  test('risk maps to an operation category', () => {
    expect(riskCategory('low')).toBe('read_only');
    expect(riskCategory('medium')).toBe('approval_required');
    expect(riskCategory('high')).toBe('approval_required');
    expect(riskCategory('critical')).toBe('destructive');
    expect(maxRisk(['low', 'high', 'medium'])).toBe('high');
    expect(maxRisk(['critical'])).toBe('critical');
  });

  test('read-only steps are never gated', () => {
    expect(approvalRequirement('low', settings())).toBe('none');
    expect(approvalRequirement('low', settings({ requireApproval: false }))).toBe('none');
  });

  test('with approval required, every mutating step is gated', () => {
    expect(approvalRequirement('medium', settings())).toBe('explicit');
    expect(approvalRequirement('high', settings())).toBe('explicit');
    expect(approvalRequirement('critical', settings())).toBe('explicit');
  });

  test('disabling the policy still gates destructive work', () => {
    const relaxed = settings({ requireApproval: false });
    expect(approvalRequirement('medium', relaxed)).toBe('none');
    expect(approvalRequirement('high', relaxed)).toBe('none');
    expect(approvalRequirement('critical', relaxed)).toBe('explicit');
  });

  test('a plan is gated when any step is gated', () => {
    expect(planApprovalRequirement(['low', 'low'], settings())).toBe('none');
    expect(planApprovalRequirement(['low', 'medium'], settings())).toBe('explicit');
    expect(planApprovalRequirement(['low'], settings({ requireApproval: false }))).toBe('none');
  });
});
