/**
 * Approval policy: decides whether a remediation needs a human before it runs.
 *
 * Pure and dependency-free so the API (who asks) and the executor (who enforces)
 * consult the identical rule — the executor re-checks so a request that bypasses
 * the API still cannot run an unapproved step.
 */
import type { ResolvexSettings } from '../config';
import type { RiskLevel } from '../domain/risk';
import { riskCategory } from '../domain/risk';

export type ApprovalRequirement = 'none' | 'explicit';

/**
 * `explicit` = an ApprovalRecord must exist and be `approved` before the step runs.
 *
 * With `require_approval` on (the default), every mutating step is gated. With it
 * off, only risks whose category is `destructive` stay gated — an emergency switch,
 * never a way to auto-run destructive changes.
 */
export function approvalRequirement(risk: RiskLevel, settings: ResolvexSettings): ApprovalRequirement {
  if (settings.requireApproval && riskCategory(risk) !== 'read_only') {
    return 'explicit';
  }
  return riskCategory(risk) === 'destructive' ? 'explicit' : 'none';
}

/** Peak requirement across a plan's steps. */
export function planApprovalRequirement(risks: readonly RiskLevel[], settings: ResolvexSettings): ApprovalRequirement {
  return risks.some(risk => approvalRequirement(risk, settings) === 'explicit') ? 'explicit' : 'none';
}
