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
export { executeResolveXInvestigation, type ResolveXExecutionResult } from './agentExecution';
export {
  ResolveXExecutionSchema,
  ResolveXExecutionStateSchema,
  assertExecutionTransition,
  canTransitionExecution,
  decideRecovery,
  type RecoveryDecision,
  type ResolveXExecution,
  type ResolveXExecutionState,
} from './domain/execution';
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
export {
  createResolveXConnector,
  type ConnectorOperation,
  type ConnectorResult,
  type ResolveXConnector,
} from './providers/connector';
export {
  EnvironmentSchema,
  ExecutionModeSchema,
  RemediationRequestSchema,
  evaluateRemediation,
  executeModeResult,
  remediationPlanHash,
  type ApprovalBinding,
  type ExecutionMode,
  type PolicyDecision,
  type RemediationRequest,
  type ResolveXEnvironment,
} from './providers/executionPolicy';
export {
  PROVIDER_CAPABILITIES,
  unavailableResult,
  unsupportedResult,
  type DevOpsProvider,
  type EnvironmentContext,
  type ProviderCapability,
  type ProviderResult,
  type ProviderStatus,
} from './providers/provider';
export { createDevOpsProviderRegistry, type DevOpsProviderRegistry } from './providers/registry';
export { createUnavailableProvider } from './providers/unavailableProvider';
export {
  buildDecisionTrace,
  type DecisionTraceEntry,
  type DecisionTraceStage,
  type Explanation,
} from './services/decisionTrace';
export {
  correlateEvidence,
  diagnosisHasProvenance,
  normalizeToolEvidence,
  type EvidenceCorrelation,
  type EvidenceRelation,
  type NormalizedEvidence,
} from './services/evidenceCorrelation';
export {
  extractIncidentMemory,
  retrieveMemory,
  type IncidentMemory,
  type MemoryConfirmation,
  type MemoryMatch,
} from './services/historicalMemory';
export {
  correlateIncidents,
  findRootCauseCandidates,
  groupCorrelatedIncidents,
  type CorrelationSignal,
  type CorrelationSignalType,
  type CorrelationStatus,
  type IncidentCorrelation,
  type IncidentGroup,
  type RootCauseCandidate,
} from './services/incidentCorrelation';
export {
  buildRecommendation,
  extractResolutionRecord,
  findSimilarIncidents,
  similarity,
  type RemediationRecommendation,
  type ResolutionRecord,
  type SimilarIncident,
  type SimilaritySignal,
} from './services/incidentMemory';
export { createIncidentService } from './services/incidentService';
export {
  addHypothesis,
  buildInvestigationContext,
  hasRepeatedToolCall,
  rankHypothesis,
  type HypothesisStatus,
  type InvestigationContext,
  type InvestigationHypothesis,
} from './services/investigationOrchestrator';
export {
  ResolveXOperationalError,
  createCircuitBreaker,
  degradedMode,
  retrySafe,
  type CircuitBreaker,
  type CircuitState,
  type ResolveXErrorCode,
} from './services/operationalSafety';
export {
  assessRisk,
  calculateBaseline,
  calculateBlastRadius,
  createPrediction,
  detectAnomaly,
  type Anomaly,
  type Baseline,
  type Prediction,
  type PredictionStatus,
  type RiskAssessment,
  type Telemetry,
} from './services/predictiveIntelligence';
export {
  RemediationActionSchema,
  assertActionTransition,
  canTransitionAction,
  decideAfterVerification,
  evaluateAction,
  planIdentity,
  transitionExecution,
  validatePlan,
  type ActionState,
  type RemediationAction,
} from './services/remediationOrchestrator';
export {
  ResolveXExecutionRecordSchema,
  ToolExecutionRecordSchema,
  createPersistentExecutionStore,
  type ExecutionStore,
  type ResolveXExecutionRecord,
  type ToolExecutionRecord,
} from './store/executionStore';
export {
  IncidentNotFoundError,
  IncidentStoreConflictError,
  createInMemoryIncidentStore,
  type IncidentStore,
} from './store/incidentStore';
export { createDemoEnvironment, createDemoTools, type DemoEnvironment } from './tools/demoTools';
export { ResolvexToolMCP, createResolvexToolMCP } from './tools/registryAdapter';
