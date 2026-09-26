/**
 * The incident aggregate: evidence, diagnosis, remediation plan, approvals,
 * verification and audit trail for one incident.
 *
 * Every type is derived from a Zod schema (no parallel hand-written interfaces),
 * all persisted/wire keys are snake_case, and no field is `any`. The whole
 * aggregate is stored as one row: indexed scalar columns for querying, this
 * document in a JSONB column, `version` for optimistic concurrency.
 */
import { z } from '@hono/zod-openapi';
import { AuditEventSchema, TimelineEventSchema } from './audit';
import { IncidentStateSchema } from './incidentState';
import { RiskLevelSchema } from './risk';

export const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low']).openapi('IncidentSeverity');
export type Severity = z.infer<typeof SeveritySchema>;

/** ISO-8601 UTC instant with milliseconds. */
const TimestampSchema = z.string().openapi('Timestamp');

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export const EvidenceKindSchema = z
  .enum(['log', 'metric', 'deployment', 'config', 'health', 'event'])
  .openapi('EvidenceKind');
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export const EvidenceRecordSchema = z
  .object({
    id: z.string().min(1),
    kind: EvidenceKindSchema,
    /** Integration id that produced it (e.g. `demo`, `http`, `prometheus`). */
    source: z.string().min(1),
    /** Tool id that collected it. */
    collector: z.string().min(1),
    observed_at: TimestampSchema,
    summary: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
  })
  .openapi('ResolvexEvidence');

export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

// ---------------------------------------------------------------------------
// Diagnosis
// ---------------------------------------------------------------------------

export const HypothesisSchema = z
  .object({
    id: z.string().min(1),
    statement: z.string().min(1),
    /** Must reference ids present on the incident; unknown ids are dropped. */
    evidence_ids: z.array(z.string().min(1)),
    confidence: z.number().min(0).max(1),
    refuted: z.boolean(),
  })
  .openapi('ResolvexHypothesis');

export type Hypothesis = z.infer<typeof HypothesisSchema>;

export const DiagnosisSchema = z
  .object({
    summary: z.string().min(1),
    /** Null when no hypothesis cleared the confidence bar. */
    root_cause: z.string().nullable(),
    root_cause_evidence_ids: z.array(z.string().min(1)),
    hypotheses: z.array(HypothesisSchema),
    confidence: z.number().min(0).max(1),
    /** Model that produced this diagnosis (provider-agnostic identity). */
    model: z.string(),
    generated_at: TimestampSchema,
  })
  .openapi('ResolvexDiagnosis');

export type Diagnosis = z.infer<typeof DiagnosisSchema>;

// ---------------------------------------------------------------------------
// Remediation
// ---------------------------------------------------------------------------

export const RemediationStepStatusSchema = z
  .enum(['pending', 'awaiting_approval', 'running', 'succeeded', 'failed', 'skipped'])
  .openapi('RemediationStepStatus');
export type RemediationStepStatus = z.infer<typeof RemediationStepStatusSchema>;

export const RemediationStepSchema = z
  .object({
    id: z.string().min(1),
    /** DevOpsTool id; a plan referencing an unknown tool is invalid. */
    tool: z.string().min(1),
    args: z.record(z.string(), z.unknown()),
    reason: z.string().min(1),
    risk: RiskLevelSchema,
    expected: z.string().min(1),
    status: RemediationStepStatusSchema,
    started_at: TimestampSchema.optional(),
    finished_at: TimestampSchema.optional(),
    result: z.record(z.string(), z.unknown()).optional(),
    error: z.string().optional(),
  })
  .openapi('ResolvexRemediationStep');

export type RemediationStep = z.infer<typeof RemediationStepSchema>;

export const RemediationPlanStatusSchema = z
  .enum(['draft', 'awaiting_approval', 'approved', 'rejected', 'running', 'done', 'failed'])
  .openapi('ResolvexRemediationPlanStatus');
export type RemediationPlanStatus = z.infer<typeof RemediationPlanStatusSchema>;

export const RemediationPlanSchema = z
  .object({
    id: z.string().min(1),
    steps: z.array(RemediationStepSchema).min(1),
    status: RemediationPlanStatusSchema,
    created_at: TimestampSchema,
  })
  .openapi('ResolvexRemediationPlan');

export type RemediationPlan = z.infer<typeof RemediationPlanSchema>;

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

export const ApprovalDecisionSchema = z.enum(['approved', 'rejected']).openapi('ResolvexApprovalDecision');
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const ApprovalRecordSchema = z
  .object({
    id: z.string().min(1),
    plan_id: z.string().min(1),
    requested_at: TimestampSchema,
    risk: RiskLevelSchema,
    reason: z.string().min(1),
    decided_at: TimestampSchema.optional(),
    decided_by: z.string().optional(),
    decision: ApprovalDecisionSchema.optional(),
    comment: z.string().optional(),
  })
  .openapi('ResolvexApproval');

export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export const VerificationCheckKindSchema = z
  .enum(['health', 'http', 'logs', 'error_rate', 'process'])
  .openapi('ResolvexVerificationCheckKind');
export type VerificationCheckKind = z.infer<typeof VerificationCheckKindSchema>;

export const VerificationCheckSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: VerificationCheckKindSchema,
    target: z.string().min(1),
    /** Null while the check has not run yet. */
    passed: z.boolean().nullable(),
    detail: z.string(),
    observed_at: TimestampSchema.optional(),
  })
  .openapi('ResolvexVerificationCheck');

export type VerificationCheck = z.infer<typeof VerificationCheckSchema>;

export const VerificationReportSchema = z
  .object({
    status: z.enum(['pending', 'passed', 'failed']).openapi('ResolvexVerificationStatus'),
    checks: z.array(VerificationCheckSchema),
    attempts: z.number().int().min(0),
  })
  .openapi('ResolvexVerificationReport');

export type VerificationReport = z.infer<typeof VerificationReportSchema>;

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

export const IncidentSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string(),
    severity: SeveritySchema,
    state: IncidentStateSchema,
    /** Integration id that raised the incident. */
    source: z.string().min(1),
    service: z.string().min(1),
    detected_at: TimestampSchema,
    updated_at: TimestampSchema,
    /** Optimistic concurrency token; bumped on every document write. */
    version: z.number().int().min(0),
    correlation_id: z.string().min(1),
    evidence: z.array(EvidenceRecordSchema),
    timeline: z.array(TimelineEventSchema),
    diagnosis: DiagnosisSchema.nullable(),
    plan: RemediationPlanSchema.nullable(),
    approvals: z.array(ApprovalRecordSchema),
    verification: VerificationReportSchema.nullable(),
    /** Append-only audit trail. */
    actions: z.array(AuditEventSchema),
    error: z.string().optional(),
  })
  .openapi('ResolvexIncident');

export type Incident = z.infer<typeof IncidentSchema>;

/** Shape returned by list endpoints: enough to render a row, not the whole trail. */
export const IncidentSummarySchema = IncidentSchema.omit({
  evidence: true,
  timeline: true,
  diagnosis: true,
  plan: true,
  approvals: true,
  verification: true,
  actions: true,
}).openapi('ResolvexIncidentSummary');

export type IncidentSummary = z.infer<typeof IncidentSummarySchema>;
