/**
 * Incident lifecycle states and the single transition table that owns them.
 *
 * Nothing outside this module may assign `Incident.state`; every move goes through
 * {@link assertTransition}, so an illegal path surfaces as an error (and an audit
 * event) instead of a silently inconsistent incident.
 */
import { z } from '@hono/zod-openapi';

export const IncidentStateSchema = z
  .enum([
    'detected',
    'investigating',
    'diagnosed',
    'remediation_pending',
    'approval_required',
    'remediating',
    'verifying',
    'resolved',
    'failed',
    'cancelled',
    'escalated',
  ])
  .openapi('IncidentState');

export type IncidentState = z.infer<typeof IncidentStateSchema>;

/** States from which the incident can no longer move. */
export const INCIDENT_TERMINAL_STATES = ['resolved', 'failed', 'cancelled', 'escalated'] as const;

/** Failure/stop paths are legal from every active state; written once, here. */
const STOP_TRANSITIONS = ['failed', 'cancelled', 'escalated'] as const satisfies readonly IncidentState[];

const TRANSITIONS: Record<IncidentState, readonly IncidentState[]> = {
  detected: ['investigating', ...STOP_TRANSITIONS],
  investigating: ['diagnosed', 'escalated', ...STOP_TRANSITIONS],
  diagnosed: ['remediation_pending', ...STOP_TRANSITIONS],
  remediation_pending: ['approval_required', 'remediating', ...STOP_TRANSITIONS],
  approval_required: ['remediating', 'cancelled', 'escalated'],
  remediating: ['verifying', 'failed', 'escalated'],
  verifying: ['resolved', 'investigating', 'failed', 'escalated'],
  resolved: [],
  failed: [],
  cancelled: [],
  escalated: [],
};

/** Thrown when code attempts an illegal lifecycle move. */
export class IllegalIncidentTransitionError extends Error {
  readonly from: IncidentState;
  readonly to: IncidentState;

  constructor(from: IncidentState, to: IncidentState) {
    super(
      `Illegal incident transition ${from} -> ${to}; allowed: ${
        TRANSITIONS[from].length > 0 ? TRANSITIONS[from].join(', ') : 'none (terminal)'
      }`,
    );
    this.name = 'IllegalIncidentTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function isTerminal(state: IncidentState): boolean {
  return (INCIDENT_TERMINAL_STATES as readonly IncidentState[]).includes(state);
}

export function canTransition(from: IncidentState, to: IncidentState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: IncidentState): readonly IncidentState[] {
  return TRANSITIONS[from];
}

/** @throws IllegalIncidentTransitionError when the move is not in the table. */
export function assertTransition(from: IncidentState, to: IncidentState): void {
  if (!canTransition(from, to)) {
    throw new IllegalIncidentTransitionError(from, to);
  }
}
