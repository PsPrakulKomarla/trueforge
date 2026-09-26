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
  GraphEvidenceDirectionSchema,
  GraphEvidenceSchema,
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
  type GraphEvidence,
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

export { createResolvexAgentDefinition, type ResolvexGraphContext } from './agent';
export { DEMO_TENANT_ID, createDemoServiceGraph } from './graph/demoTopology';
export { createInMemoryGraphStore, type GraphStore } from './graph/graphStore';
export {
  EdgeRelationshipSchema,
  GraphEdgeSchema,
  GraphNodeSchema,
  GraphPathSchema,
  NodeTypeSchema,
  createServiceGraph,
  type EdgeRelationship,
  type GraphEdge,
  type GraphNode,
  type GraphPath,
  type NodeType,
  type ServiceGraph,
} from './graph/serviceGraph';
export { createIncidentService } from './services/incidentService';
export {
  IncidentNotFoundError,
  IncidentStoreConflictError,
  createInMemoryIncidentStore,
  type IncidentStore,
} from './store/incidentStore';
export { createDemoEnvironment, createDemoTools, type DemoEnvironment } from './tools/demoTools';
export { ResolvexToolMCP, createResolvexToolMCP } from './tools/registryAdapter';
export { executeResolveXInvestigation, type ResolveXExecutionResult, type ResolveXExecutionState } from './agentExecution';
export { ResolveXExecutionSchema, ResolveXExecutionStateSchema, assertExecutionTransition, canTransitionExecution, decideRecovery, type ResolveXExecution, type ResolveXExecutionState, type RecoveryDecision } from './domain/execution';
export { buildRecommendation, extractResolutionRecord, findSimilarIncidents, similarity, type SimilarIncident, type SimilaritySignal, type ResolutionRecord, type RemediationRecommendation } from './services/incidentMemory';
export { addHypothesis, buildInvestigationContext, hasRepeatedToolCall, rankHypothesis, type HypothesisStatus, type InvestigationContext, type InvestigationHypothesis } from './services/investigationOrchestrator';
export { createDevOpsProviderRegistry, type DevOpsProviderRegistry } from './providers/registry';
export { createUnavailableProvider } from './providers/unavailableProvider';
export { PROVIDER_CAPABILITIES, unavailableResult, unsupportedResult, type DevOpsProvider, type EnvironmentContext, type ProviderCapability, type ProviderResult, type ProviderStatus } from './providers/provider';
