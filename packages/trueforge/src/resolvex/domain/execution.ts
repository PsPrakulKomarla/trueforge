import { z } from '@hono/zod-openapi';

export const ResolveXExecutionStateSchema = z.enum(['queued', 'investigating', 'diagnosing', 'planning', 'waiting_for_approval', 'remediating', 'verifying', 'retrying', 'resolved', 'failed', 'escalated', 'cancelled']).openapi('ResolveXExecutionState');
export type ResolveXExecutionState = z.infer<typeof ResolveXExecutionStateSchema>;
export const ResolveXExecutionSchema = z.object({ execution_id: z.string().min(1), incident_id: z.string().min(1), agent_thread_id: z.string().min(1).optional(), tenant_id: z.string().min(1), started_at: z.string(), updated_at: z.string(), state: ResolveXExecutionStateSchema, attempt: z.number().int().min(0), current_action: z.string().optional(), tool_calls: z.number().int().min(0), error: z.string().optional() }).openapi('ResolveXExecution');
export type ResolveXExecution = z.infer<typeof ResolveXExecutionSchema>;

const transitions: Record<ResolveXExecutionState, readonly ResolveXExecutionState[]> = {
  queued: ['investigating', 'cancelled'], investigating: ['diagnosing', 'failed', 'escalated'], diagnosing: ['planning', 'failed', 'escalated'], planning: ['waiting_for_approval', 'remediating', 'failed'], waiting_for_approval: ['remediating', 'cancelled', 'escalated'], remediating: ['verifying', 'failed', 'escalated'], verifying: ['resolved', 'retrying', 'failed', 'escalated'], retrying: ['investigating', 'escalated'], resolved: [], failed: [], escalated: [], cancelled: [],
};
export function canTransitionExecution(from: ResolveXExecutionState, to: ResolveXExecutionState): boolean { return transitions[from].includes(to); }
export function assertExecutionTransition(from: ResolveXExecutionState, to: ResolveXExecutionState): void { if (!canTransitionExecution(from, to)) throw new Error(`Illegal ResolveX execution transition ${from} -> ${to}`); }

export type RecoveryDecision = 'resolved' | 'retry_investigation' | 'escalated';
export function decideRecovery(input: { verification: 'passed' | 'failed' | 'uncertain'; attempt: number; maxAttempts: number; hasAlternative: boolean }): RecoveryDecision {
  if (input.verification === 'passed') return 'resolved';
  if (input.attempt >= input.maxAttempts || !input.hasAlternative) return 'escalated';
  return 'retry_investigation';
}
