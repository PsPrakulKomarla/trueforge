import { createHash } from 'node:crypto';
import { z } from 'zod';
export const ExecutionModeSchema = z.enum(['DRY_RUN', 'MOCK', 'REAL']);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;
export const EnvironmentSchema = z.enum(['development', 'staging', 'production']);
export type ResolveXEnvironment = z.infer<typeof EnvironmentSchema>;
export const RemediationRequestSchema = z.object({
  operation: z.string().min(1),
  target: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9._:/-]+$/),
  deployment: z.string().optional(),
  risk: z.enum(['low', 'medium', 'high']),
  reason: z.string().min(1).max(2000),
  expected_effect: z.string().min(1).max(2000),
  rollback_strategy: z.string().min(1).max(2000),
  verification_strategy: z.string().min(1).max(2000),
});
export type RemediationRequest = z.infer<typeof RemediationRequestSchema>;
export interface ApprovalBinding {
  incident_id: string;
  plan_id: string;
  operation: string;
  target: string;
  plan_hash: string;
  approval_id: string;
}
export type PolicyDecision =
  { allowed: true; plan_hash: string; requires_approval: boolean } | { allowed: false; reason: string };
export function remediationPlanHash(plan: RemediationRequest): string {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}
export function evaluateRemediation(input: {
  plan: RemediationRequest;
  mode: ExecutionMode;
  environment: ResolveXEnvironment;
  approval?: ApprovalBinding;
  incidentId: string;
  planId: string;
}): PolicyDecision {
  const parsed = RemediationRequestSchema.safeParse(input.plan);
  if (!parsed.success) {
    return { allowed: false, reason: 'Invalid remediation plan' };
  }
  const hash = remediationPlanHash(parsed.data);
  if (input.mode !== 'DRY_RUN' && parsed.data.risk !== 'low' && input.approval === undefined) {
    return { allowed: false, reason: 'Explicit approval is required for this remediation' };
  }
  if (
    input.approval &&
    (input.approval.incident_id !== input.incidentId ||
      input.approval.plan_id !== input.planId ||
      input.approval.operation !== parsed.data.operation ||
      input.approval.target !== parsed.data.target ||
      input.approval.plan_hash !== hash)
  ) {
    return { allowed: false, reason: 'Approval does not match the requested remediation plan' };
  }
  return {
    allowed: true,
    plan_hash: hash,
    requires_approval: parsed.data.risk !== 'low' || (input.mode === 'REAL' && input.environment !== 'development'),
  };
}
export function executeModeResult(
  plan: RemediationRequest,
  mode: ExecutionMode,
  provider: string,
): {
  success: boolean;
  operation: string;
  target: string;
  execution_mode: ExecutionMode;
  provider: string;
  executed: boolean;
  verification_required: boolean;
  summary: string;
} {
  return {
    success: true,
    operation: plan.operation,
    target: plan.target,
    execution_mode: mode,
    provider,
    executed: mode === 'REAL',
    verification_required: true,
    summary:
      mode === 'DRY_RUN'
        ? 'Validated only; no infrastructure mutation executed'
        : mode === 'MOCK'
          ? 'Deterministic mock operation executed'
          : 'Real provider operation executed',
  };
}
