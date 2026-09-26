/**
 * ResolveX: autonomous DevOps incident investigation and remediation.
 *
 * Public surface of the ResolveX domain. Nothing here reads `process.env`, opens
 * a database or knows an AI vendor — those arrive from the server wiring.
 */
export { resolvexSettings, type ResolvexSettings } from './config';

export {
  INCIDENT_TERMINAL_STATES,
  IllegalIncidentTransitionError,
  IncidentStateSchema,
  allowedTransitions,
  assertTransition,
  canTransition,
  isTerminal,
  type IncidentState,
} from './domain/incidentState';

export {
  RiskCategorySchema,
  RiskLevelSchema,
  maxRisk,
  riskCategory,
  type RiskCategory,
  type RiskLevel,
} from './domain/risk';

export {
  AuditActionStatusSchema,
  AuditEventSchema,
  TimelineEventKindSchema,
  TimelineEventSchema,
  type AuditEvent,
  type TimelineEvent,
  type TimelineEventKind,
} from './domain/audit';

export {
  ApprovalDecisionSchema,
  ApprovalRecordSchema,
  DiagnosisSchema,
  EvidenceKindSchema,
  EvidenceRecordSchema,
  HypothesisSchema,
  IncidentSchema,
  IncidentSummarySchema,
  RemediationPlanSchema,
  RemediationPlanStatusSchema,
  RemediationStepSchema,
  RemediationStepStatusSchema,
  SeveritySchema,
  VerificationCheckKindSchema,
  VerificationCheckSchema,
  VerificationReportSchema,
  type ApprovalDecision,
  type ApprovalRecord,
  type Diagnosis,
  type EvidenceKind,
  type EvidenceRecord,
  type Hypothesis,
  type Incident,
  type IncidentSummary,
  type RemediationPlan,
  type RemediationPlanStatus,
  type RemediationStep,
  type RemediationStepStatus,
  type Severity,
  type VerificationCheck,
  type VerificationCheckKind,
  type VerificationReport,
} from './domain/incident';

export { approvalRequirement, planApprovalRequirement, type ApprovalRequirement } from './policies/approvalPolicy';

export {
  ToolInputValidationError,
  createDevOpsToolRegistry,
  defineDevOpsTool,
  type DevOpsTool,
  type DevOpsToolRegistry,
  type ToolCategory,
  type ToolContext,
  type ToolResult,
  type ToolValidation,
} from './tools/devopsTool';

export type { AIGenerateRequest, AIProvider, AIStreamEvent, AIStructuredRequest, AITextResult } from './ai/provider';
