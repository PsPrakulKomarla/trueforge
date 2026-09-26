/**
 * Append-only audit and timeline contracts.
 *
 * These are the record of *what the agent did, why, and who allowed it*. Both are
 * write-only: there is no update path, so an audit trail cannot be rewritten after
 * the fact. Keys are snake_case because they are persisted into the incident
 * document and exposed on the wire.
 */
import { z } from '@hono/zod-openapi';
import { RiskLevelSchema } from './risk';

export const AuditActionStatusSchema = z.enum(['ok', 'error', 'denied']).openapi('AuditActionStatus');

/** ISO-8601 UTC instant with milliseconds (`Date.prototype.toISOString()`). */
const TimestampSchema = z.string().openapi('Timestamp');

export const AuditEventSchema = z
  .object({
    at: TimestampSchema,
    /** `system` | `agent:<name>` | authenticated subject id. */
    actor: z.string().min(1),
    incident_id: z.string().min(1),
    /** Lifecycle action or tool id that was performed. */
    action: z.string().min(1),
    tool: z.string().optional(),
    input: z.record(z.string(), z.unknown()).optional(),
    result: z.record(z.string(), z.unknown()).optional(),
    risk: RiskLevelSchema.optional(),
    approval_id: z.string().optional(),
    status: AuditActionStatusSchema,
    correlation_id: z.string().min(1),
  })
  .openapi('ResolvexAuditEvent');

export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const TimelineEventKindSchema = z
  .enum([
    'detected',
    'state_changed',
    'evidence_collected',
    'diagnosis_generated',
    'plan_created',
    'approval_requested',
    'approval_decided',
    'step_executed',
    'verification_run',
    'report_generated',
    'error',
  ])
  .openapi('ResolvexTimelineEventKind');

export type TimelineEventKind = z.infer<typeof TimelineEventKindSchema>;

export const TimelineEventSchema = z
  .object({
    at: TimestampSchema,
    kind: TimelineEventKindSchema,
    message: z.string().min(1),
    actor: z.string().min(1),
    correlation_id: z.string().min(1),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('ResolvexTimelineEvent');

export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
