# ResolveX Architecture

ResolveX is an autonomous DevOps incident investigation and remediation agent built as a
**product layer on top of TrueForge**. It does not fork, fork-lite, or reimplement TrueForge:
every capability below is either reused as-is or added as a new, self-contained module.

Workflow:

```
DETECT → COLLECT EVIDENCE → INVESTIGATE → ROOT CAUSE → PLAN → APPROVAL → EXECUTE → VERIFY → REPORT
```

---

## 1. Repository audit findings

### 1.1 Monorepo shape

| Item                                  | Value                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Workspace globs                       | `packages/*` (`pnpm-workspace.yaml`)                                                                            |
| Manager / Node                        | `pnpm@11.16.0`, Node `>=22.14.0`                                                                                |
| Packages                              | `assistant-ui-runtime`, `frontend`, `trueforge`, `trueforge-core`, `trueforge-sdk`, `trueforge-ui`              |
| There is **no** top-level `frontend/` | the web app lives at `packages/frontend` (private, name `frontend`)                                             |
| Docker                                | `Dockerfile` (app), `Dockerfile.npm`, `docker-compose.yml` (smoke stack), `docker-compose.dev.yml` (host infra) |
| CI                                    | `.github/workflows/ci.yml` — path filters + package `matrix`, mirrored by root `package.json` `test:*` scripts  |

### 1.2 What TrueForge already provides (reused, not rebuilt)

| Capability               | Where                                                                                                                                                                       | Reused by ResolveX for                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| HTTP framework           | `hono` + `@hono/zod-openapi` (`packages/trueforge/src/app.ts`)                                                                                                              | ResolveX REST API                                   |
| Route registration       | `app.route('/api/v1/<group>', createXRouter(deps))` in `app.ts`                                                                                                             | mounting `/api/v1/incidents`                        |
| OpenAPI + Swagger        | `createRoute()` per route, `OPENAPI_DOCUMENT_TAGS`, `GET /api/v1/docs`                                                                                                      | documenting ResolveX endpoints                      |
| Validation               | `zod` v4 everywhere; `zodValidationHook` / `zodErrorResponse`                                                                                                               | request/response schemas                            |
| Error envelope           | `{ error: { message } }` via `createAppErrorHandler` (`app.ts:103`)                                                                                                         | API errors                                          |
| Persistence              | `kysely` with **dual backends**: SQLite (`STANDALONE=true`) and Postgres (`STANDALONE=false`); migrations under `src/db/sqlite/migrations` and `src/db/postgres/migrations` | incident persistence                                |
| Store pattern            | `src/db/<x>Store.ts` interface + `db/sqlite/<x>-store/` + `db/postgres/<x>-store/`, wired in `main.ts` / `controller-main.ts`                                               | `IResolvexIncidentStore`                            |
| Auth                     | `createAuthMiddleware` / `createApiKeyAuthMiddleware`, `withAuth()` shell, `resolveRequestContext` (`app.ts:62`, `auth/identity.ts`)                                        | protecting ResolveX routes                          |
| Config                   | `src/config.ts` — single env-read owner, Zod-validated, fails fast at boot                                                                                                  | ResolveX config keys                                |
| Logging                  | `winston` via `src/logger.ts` (`createServerLogger`), one-line `createAccessLogMiddleware`                                                                                  | structured ResolveX logs                            |
| AI provider abstraction  | `ILLM` (`trueforge-core/src/core/llm/ILLM.ts`) + `VercelAILLM` (`core/llm/VercelAILLM.ts`) supporting `google-gemini`, `openai`, `anthropic`, OpenAI-compatible, …          | **this already is the `AIProvider` ResolveX needs** |
| Model resolution         | `getModelDetails({tenant_id, name, store})` (`src/runtime/sessionResources.ts:152`) → `new VercelAILLM({providerConfig, logger, signal})`                                   | constructing the investigation LLM                  |
| Structured output        | `ResponseFormat` (`core/llm/responseFormat.ts`) — `text` / `json_object` / `json_schema`                                                                                    | evidence-backed diagnosis as typed JSON             |
| Tool system              | `defineTool()` + `LocalToolMCP` + `IToolSet` + `ToolSet` policy layer (`core/mcp/*`); MCP tool annotations carry `is_approval_required`                                     | ResolveX `DevOpsTool` registry, approval gating     |
| Approval primitive       | `ApprovalRequiredResponse` / `ApprovalDecision` (`core/mcp/IMCPServer.ts`, `events/schema`) and `ToolApprovalContainer` in `trueforge-ui`                                   | human-in-the-loop for remediation                   |
| Frontend shell           | `packages/frontend` (React 19, Vite 6, Tailwind **v4**, `react-router-dom` 7) + `@truefoundry/trueforge-ui`                                                                 | host for ResolveX command center                    |
| SPA serving + deep links | `mountFrontend()` (`src/frontend.ts:67`) — static build, cache headers, and an HTML `Accept` SPA fallback for any client route                                              | `/resolvex/*` deep links work with no server change |
| Test runners             | `jest` (`jest.unit.config.cjs`, roots `tests/unit`) for the server, `tsx --test` for `frontend/tests`                                                                       | ResolveX unit + contract tests                      |

### 1.3 What does **not** exist and must be added

- Incident domain model, lifecycle state machine, persistence.
- Evidence collection / diagnosis / remediation / verification engines.
- DevOps tool abstraction (`DevOpsTool` with risk levels) and its provider implementations.
- Approval records and audit log for autonomous actions.
- ResolveX REST surface and command-center UI.

### 1.4 Constraints discovered

- **Windows dev host.** Native local sandbox is unreliable here; the repo already runs through
  Docker (`docker-compose.yml`, `docker-compose.dev.yml`). ResolveX's demo target must be a
  containerized service, never a host-process dependency.
- **Dual DB backends.** Every new table needs a SQLite _and_ a Postgres migration, plus two
  store implementations, or `pnpm test:store:*` breaks.
- **CI symmetry rule** (`AGENTS.md`): adding a workspace package forces changes to
  `ci.yml` path filters, the package matrix, and root `test:*` scripts.
- **Autogenerated artifacts**: `.github/fern/openapi/openapi.json`, `docs/openapi.json`,
  `packages/trueforge-sdk`, `python/trueforge_sdk` must not be hand-edited.

---

## 2. Placement decision (the one architectural choice that matters)

**ResolveX lives inside the existing packages. No new workspace package.**

| Layer                       | Location                                                                            | Why                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Domain, engines, tools, API | `packages/trueforge/src/resolvex/**`                                                | inherits config, logger, auth, Kysely stores, Hono mounting, Jest setup — zero CI/workspace churn |
| Store interface             | `packages/trueforge/src/db/resolvexStore.ts`                                        | matches every other store (`scheduleStore.ts`, `agentStore.ts`)                                   |
| Migrations                  | `packages/trueforge/src/db/{sqlite,postgres}/migrations/<ts>_resolvex_incident.ts`  | required by both backends                                                                         |
| Store impls                 | `packages/trueforge/src/db/{sqlite,postgres}/resolvex-store/`                       | existing convention                                                                               |
| Server tests                | `packages/trueforge/tests/resolvex/**` (registered in `jest.unit.config.cjs` roots) | `tests/` top-level requirement                                                                    |
| UI                          | `packages/frontend/src/resolvex/**`                                                 | same Vite app, same auth fetch, same build                                                        |
| UI tests                    | `packages/frontend/tests/resolvex/*.test.ts`                                        | existing `tsx --test` runner                                                                      |

Rejected alternatives:

- **New `packages/resolvex` workspace package** — correct for an independent product, but costs a
  `tsup` build, `tsconfig`, ESLint scope, `ci.yml` filter + matrix entry, root `test:*` script,
  and a changeset, before a single line of domain logic exists. Nothing ResolveX needs is
  unavailable inside `packages/trueforge`. Revisit only if ResolveX is ever published separately.
- **Driving ResolveX through the full chat turn machinery** (session → turn → SSE) — heavyweight:
  every incident phase would need a session, a streamed event log, and UI thread plumbing. The
  investigation step is one bounded structured LLM call, not an open-ended agent conversation.
  ResolveX calls `ILLM` directly. The chat harness stays untouched.

---

## 3. Module layout

```
packages/trueforge/src/resolvex/
├── index.ts                     # public barrel (types + factory only)
├── config.ts                    # ResolveX config keys read via src/config.ts (no direct process.env)
├── lifecycle/
│   ├── incidentState.ts         # states + transition table (single source of truth)
│   └── transitions.ts           # guard-checked `canTransition()` / `transition()`
├── incidents/
│   ├── incident.types.ts        # Incident document type (z.infer from schemas)
│   ├── incident.schemas.ts      # Zod schemas — wire + persistence shapes
│   ├── incident.repository.ts   # wraps IResolvexIncidentStore, owns the aggregate
│   └── incident.service.ts      # orchestration entry points used by the API
├── investigation/
│   ├── evidence/evidenceCollector.ts   # runs the collectors needed for an incident
│   ├── evidence/normalize.ts           # canonical EvidenceRecord shape
│   ├── diagnosis/diagnose.ts           # LLM call -> Hypothesis[] + diagnosis
│   ├── diagnosis/prompts.ts
│   └── rootCause/rootCause.ts          # scoring, evidence binding, confidence
├── remediation/
│   ├── plans/plan.types.ts             # RemediationPlan / RemediationStep
│   ├── plans/buildPlan.ts              # diagnosis -> plan (validated)
│   ├── policies/riskPolicy.ts          # risk classification + approval requirement
│   ├── policies/approval.ts            # approve/reject + audit event
│   └── execution/executor.ts           # step loop, per-step record, abort on failure
├── verification/
│   ├── verifier.ts                     # runs checks; returns VerificationReport
│   └── checks/*.ts                     # health / http / logs / error-rate checks
├── tools/
│   ├── devopsTool.ts                   # DevOpsTool interface + registry
│   ├── registry.ts                     # register/list by id + risk
│   ├── diagnostics/*.ts                # read-only tools (LOW risk)
│   ├── remediation/*.ts                # mutating tools (MEDIUM+ risk)
│   └── verification/*.ts
├── integrations/
│   ├── provider.ts                     # IntegrationProvider interface (logs/metrics/k8s/…)
│   ├── demo/*.ts                       # deterministic demo provider
│   └── http/*.ts                       # generic HTTP health/status provider
├── audit/auditLog.ts                   # append-only audit events on the incident document
├── report/incidentReport.ts            # final markdown/JSON report
├── api/                                # Hono route definitions (createRoute) + handlers
└── demo/demoScenario.ts                # the reproducible RX-001 scenario
```

Frontend:

```
packages/frontend/src/resolvex/
├── ResolvexApp.tsx            # own <BrowserRouter basename="/resolvex">
├── api/client.ts              # fetch wrapper over /api/v1/incidents
├── pages/{Dashboard,Incidents,IncidentDetail,Investigation,Remediation,Audit,Tools,Settings}.tsx
├── features/{incidents,investigation,remediation,services,dashboard}/
├── components/                # status pill, timeline, evidence list, risk badge, approval card
└── types.ts                   # z.infer mirrors of the API schemas
```

---

## 4. Domain model

Single **incident aggregate** persisted as one row: indexed scalar columns for query/filter, plus a
`doc` JSONB holding evidence, timeline, diagnosis, plan, approvals and audit log.

```ts
type IncidentId = string; // `RX-<ulid>`

type Severity = 'critical' | 'high' | 'medium' | 'low';
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

type IncidentState =
  | 'detected'
  | 'investigating'
  | 'diagnosed'
  | 'remediation_pending'
  | 'approval_required'
  | 'remediating'
  | 'verifying'
  | 'resolved'
  | 'failed'
  | 'cancelled'
  | 'escalated';

interface EvidenceRecord {
  id: string;
  kind: 'log' | 'metric' | 'deployment' | 'config' | 'health' | 'event';
  source: string; // integration id that produced it
  observedAt: string; // ISO-8601
  summary: string;
  data: Record<string, unknown>; // snake_case keys (wire + persistence rule)
  collector: string; // tool id
}

interface Hypothesis {
  id: string;
  statement: string;
  evidenceIds: string[]; // MUST be non-empty for a root cause
  confidence: number; // 0..1
  refuted: boolean;
}

interface Diagnosis {
  summary: string;
  rootCause: string | null;
  rootCauseEvidenceIds: string[];
  hypotheses: Hypothesis[];
  confidence: number;
  model: string;
  generatedAt: string;
}

interface RemediationStep {
  id: string;
  tool: string; // DevOpsTool id; unknown id = plan is invalid
  args: Record<string, unknown>;
  reason: string;
  risk: RiskLevel;
  expected: string;
  status: 'pending' | 'awaiting_approval' | 'running' | 'succeeded' | 'failed' | 'skipped';
  startedAt?: string;
  finishedAt?: string;
  result?: Record<string, unknown>;
  error?: string;
}

interface RemediationPlan {
  id: string;
  steps: RemediationStep[];
  status: 'draft' | 'awaiting_approval' | 'approved' | 'rejected' | 'running' | 'done' | 'failed';
  createdAt: string;
}

interface ApprovalRecord {
  id: string;
  planId: string;
  requestedAt: string;
  risk: RiskLevel;
  reason: string;
  decidedAt?: string;
  decidedBy?: string;
  decision?: 'approved' | 'rejected';
  comment?: string;
}

interface VerificationCheck {
  id: string;
  name: string;
  kind: 'health' | 'http' | 'logs' | 'error_rate' | 'process';
  target: string;
  passed: boolean | null;
  detail: string;
  observedAt?: string;
}

interface VerificationReport {
  status: 'pending' | 'passed' | 'failed';
  checks: VerificationCheck[];
  attempts: number;
}

interface TimelineEvent {
  at: string;
  state: IncidentState | null;
  kind: string; // 'detected' | 'evidence_collected' | 'state_changed' | …
  message: string;
  actor: string; // 'system' | 'agent:<name>' | subject id
  data?: Record<string, unknown>;
}

interface AuditEvent {
  at: string;
  actor: string;
  incidentId: IncidentId;
  action: string; // tool id or lifecycle action
  tool?: string;
  input?: Record<string, unknown>;
  result?: Record<string, unknown>;
  risk?: RiskLevel;
  approvalId?: string;
  status: 'ok' | 'error' | 'denied';
  correlationId: string;
}

interface Incident {
  id: IncidentId;
  title: string;
  description: string;
  severity: Severity;
  state: IncidentState;
  source: string; // integration id that raised it
  service: string;
  detectedAt: string;
  updatedAt: string;
  version: number; // optimistic concurrency
  correlationId: string;
  evidence: EvidenceRecord[];
  timeline: TimelineEvent[];
  diagnosis: Diagnosis | null;
  plan: RemediationPlan | null;
  approvals: ApprovalRecord[];
  verification: VerificationReport | null;
  actions: AuditEvent[];
  error?: string;
}
```

No `any` anywhere on this surface; every wire type is a `z.infer` of a named schema
(repo rule: schemas own their types).

### 4.1 State machine

`lifecycle/incidentState.ts` holds one transition table; nothing else may mutate `state`.

```
detected ─→ investigating ─→ diagnosed ─→ remediation_pending ─→ approval_required
                ↑                │                 │                    │
                │                └─(no root cause)─┘                    │ approved
                │                                                       ▼
                │            remediation_pending ──(risk < threshold)──→ remediating
                │                                                       ▼
                └──── verification failed ──────────────────────── verifying
                                                                        │ all checks pass
                                                                        ▼
                                                                    resolved

any non-terminal ─→ failed | cancelled | escalated
resolved | failed | cancelled | escalated are terminal
```

- `approval_required` is **mandatory** when any step risk is `high` or `critical`.
- `verifying → investigating` on failed verification is what makes the loop closed and autonomous.
- Illegal transitions throw and are recorded as an audit event; the incident never silently moves.

### 4.2 Risk policy

| Risk       | Examples                                                 | Approval                                   |
| ---------- | -------------------------------------------------------- | ------------------------------------------ |
| `low`      | read logs, read status, run health check, read metrics   | none                                       |
| `medium`   | restart a **non-production** service, clear a temp cache | none by default, configurable              |
| `high`     | production restart, config change, deployment rollback   | **required**                               |
| `critical` | database deletion, destructive infra change              | **required + explicit typed confirmation** |

`policies/riskPolicy.ts` is a pure function: `requiredApproval(plan) -> 'none' | 'explicit'`.
One policy, consulted by both the API and the executor — the executor re-checks so a bypassed API
call still cannot run an unapproved high-risk step.

---

## 5. Investigation engine

```
Incident
  → EvidenceCollector      (runs collectors registered for the incident's source/service)
  → Normalizer             (every item becomes an EvidenceRecord, deduped by id)
  → Diagnose (ILLM)        (structured output: hypotheses, each bound to evidence ids)
  → RootCause              (validates every root-cause evidence id exists; drops hallucinated refs)
  → Confidence             (min(evidence support, model confidence), clamped)
  → RemediationPlanner     (only when confidence >= threshold, else escalate)
```

Rules:

- The model **never invents evidence**: `rootCauseEvidenceIds` and every
  `hypothesis.evidenceIds` are validated against collected evidence ids. Unknown ids drop that
  claim; a root cause with zero surviving evidence is not a root cause → state stays
  `investigating`, incident escalates instead of pretending to know.
- The model **never invents tools**: the planner may only reference ids present in the
  `DevOpsTool` registry. Unknown tool ⇒ plan rejected.
- Confidence threshold and max evidence bytes come from `resolvex/config.ts`.

### 5.1 AI provider

No Gemini-specific code anywhere in ResolveX. `investigation/diagnose.ts` depends on a narrow
injected interface:

```ts
interface DiagnoseLLM {
  structured<T>(req: { system: string; user: string; schema: ZodType<T>; signal?: AbortSignal }): Promise<T>;
}
```

The production adapter wraps `ILLM` (`VercelAILLM`) built from
`getModelDetails()` + `ResponseFormat` `json_schema`, so the model comes from the tenant's
configured model provider (`google-gemini` today, `openai`/`anthropic`/any OpenAI-compatible
tomorrow) without touching ResolveX. The test adapter returns a fixed payload, which is what makes
the demo and tests deterministic.

---

## 6. Tool architecture

```ts
interface DevOpsTool<A> {
  id: string; // stable, snake_case
  name: string;
  description: string;
  category: 'diagnostics' | 'remediation' | 'verification';
  risk: RiskLevel;
  requiredPermissions: string[];
  schema: ZodType<A>; // input validation at the boundary
  execute(args: A, ctx: ToolContext): Promise<ToolResult>;
  validate?(args: A, ctx: ToolContext): Promise<ValidationResult>; // pre-flight
  rollback?(args: A, ctx: ToolContext): Promise<ToolResult>; // where meaningful
}
```

MVP registry (only these, all real):

| Tool                     | Category     | Risk                       | Notes                        |
| ------------------------ | ------------ | -------------------------- | ---------------------------- |
| `get_service_status`     | diagnostics  | low                        | integration-backed           |
| `get_logs`               | diagnostics  | low                        | bounded tail, redacted       |
| `get_metrics`            | diagnostics  | low                        | error rate / latency         |
| `get_recent_deployments` | diagnostics  | low                        | correlates onset with deploy |
| `run_health_check`       | verification | low                        | HTTP probe                   |
| `restart_service`        | remediation  | high (prod) / medium (dev) | approval-gated in prod       |
| `rollback_deployment`    | remediation  | high                       | approval-gated               |

Anything not in the registry returns an explicit `unavailable` tool result — **no stubs, no
pretend tools**. Integrations follow the same rule: an unconfigured integration makes its tools
report `unavailable` rather than fabricate data.

`ToolContext` carries `{ incidentId, correlationId, tenantId, logger, signal }` so every execution
is attributable.

---

## 7. Execution, approval and audit

1. `POST /remediation` builds a plan from the diagnosis → state `remediation_pending`.
2. `riskPolicy.requiredApproval(plan)` → `explicit` ⇒ state `approval_required`, an
   `ApprovalRecord` is written, plan status `awaiting_approval`.
3. `POST /approve` (subject id recorded) ⇒ plan `approved`, state → `remediating`.
   `POST /reject` ⇒ plan `rejected`, state → `cancelled`. Both append a timeline event **and**
   an audit event.
4. `executor.ts` runs steps **sequentially**:
   - re-check approval for each high/critical step (defence in depth),
   - `validate()` before, `execute()` during, record `result`/`error`/`finishedAt`,
   - append an `AuditEvent` per step,
   - stop on first failure → state `failed`, remaining steps `skipped`.
5. Step records and audit events live on the incident document, so
   _"what did it do, why, who approved, did it work"_ is one record read.

Audit events are append-only: no update path exists on `AuditEvent`.

---

## 8. Verification (never claim success without it)

`POST /verify` runs the checks implied by the plan (`health`, `logs`, `error_rate`, `process`) and
writes a `VerificationReport`.

- all `passed === true` ⇒ `verifying → resolved`, report + incident report generated.
- any failure ⇒ `verifying → investigating`, `verification.attempts += 1`, and the engine
  re-collects evidence (the report is included as evidence so the second diagnosis sees what
  failed). After `MAX_VERIFICATION_ATTEMPTS` ⇒ `escalated`.
- a tool returning success with a failing health check therefore **cannot** reach `resolved`.

---

## 9. API

Mounted in `app.ts` behind `withAuth`, exactly like the other groups:

```
POST /api/v1/incidents                     create (or demo-trigger) an incident
GET  /api/v1/incidents                     list (state, severity, service filters; token pagination)
GET  /api/v1/incidents/:incident_id        full aggregate
GET  /api/v1/incidents/:incident_id/timeline
GET  /api/v1/incidents/:incident_id/evidence
POST /api/v1/incidents/:incident_id/investigate
POST /api/v1/incidents/:incident_id/remediation
POST /api/v1/incidents/:incident_id/approve
POST /api/v1/incidents/:incident_id/reject
POST /api/v1/incidents/:incident_id/verify
GET  /api/v1/incidents/:incident_id/report
GET  /api/v1/resolvex/tools                registry + availability
GET  /api/v1/resolvex/services             service inventory (integration-backed)
```

Conventions inherited from the existing API: `snake_case` params/fields, ULID-ish ids,
`{ data }` success envelope where groups already use it, `{ error: { message } }` errors, Zod
request/response schemas, an `OpenApiTag.RESOLVEX` added to `openapiTags.ts` +
`OPENAPI_DOCUMENT_TAGS`. The OpenAPI JSON is autogenerated — never hand-edited.

Long operations (`investigate`, `verify`) run synchronously in the MVP with an
`AbortSignal` + correlation id; no job queue is introduced.

---

## 10. Frontend

`packages/frontend/src/App.tsx` branches **before** the chat boot work:

```tsx
if (isResolvexPath(window.location.pathname)) return <ResolvexApp basename={uiBasePath + 'resolvex'} />;
```

`TrueForgeUIWithRouter` owns its own `BrowserRouter`, so ResolveX gets a sibling router rather
than being injected into the chat shell. The server needs no change: `mountFrontend`'s SPA fallback
already serves the shell for any deep link.

Routes (`/resolvex` base): `/`, `/incidents`, `/incidents/:id`, `/investigation`,
`/remediation`, `/services`, `/tools`, `/audit`, `/settings`. MVP priority: dashboard, incident
detail, investigation timeline, approval, verification result.

Visual direction: dark command-center, zinc/black foundation, one restrained accent, translucent
surfaces, high density, `rem`-based sizing (repo rule; Tailwind spacing scale), Lucide icons,
CSS transitions only. Business logic stays out of components; `features/*/api` does the fetching.

---

## 11. Demo environment

`integrations/demo` implements the `IntegrationProvider` interface with an **in-memory, seeded**
mini-infrastructure: `payment-api` (replicas, health, error rate, logs, deployments).

`POST /api/v1/incidents` with `{ source: 'demo', scenario: 'rx-001' }` deterministically:

1. detects `payment-api` failure (pool exhaustion after `v2.4.1`),
2. collects 142 connection-timeout log lines + 100% pool utilization + deploy `v2.4.1`,
3. diagnoses with evidence-bound hypotheses (fixed seed → same output),
4. plans `restart_service` + `run_health_check` + `verify_error_rate`,
5. blocks at `approval_required`,
6. on approval executes, verifies (error rate 100% → 0.2%, health 200), reaches `resolved`,
7. emits the incident report.

Deterministic because (a) the evidence is seeded, and (b) the diagnose step can be pinned to the
test/demo `DiagnoseLLM` adapter via config. It runs entirely in-process — nothing touches the
developer's machine, no Docker dependency for the demo itself. The Docker stack stays the way to
run the whole product (Postgres/Redis/server), unchanged from TrueForge.

---

## 12. Observability

- `winston` logger with `correlation_id`, `incident_id`, `tool`, `step`, `state` fields on every
  ResolveX log line; correlation id minted at incident creation and propagated to all evidence,
  diagnosis, tool calls, approvals and verification.
- No secrets in logs (tool args pass through the same redaction the existing log tooling uses).
- Log field names chosen to map 1:1 onto OpenTelemetry span attributes later; no OTel SDK is added
  for the MVP.

---

## 13. Testing

| Layer                                                  | Location                                                     | Runner                    |
| ------------------------------------------------------ | ------------------------------------------------------------ | ------------------------- |
| State machine transitions (legal + illegal)            | `tests/resolvex/lifecycle/*.test.ts`                         | jest                      |
| Evidence collection + normalization                    | `tests/resolvex/investigation/*.test.ts`                     | jest                      |
| Diagnosis evidence binding / hallucinated-id rejection | `tests/resolvex/investigation/*.test.ts`                     | jest (fake `DiagnoseLLM`) |
| Risk policy + approval gate                            | `tests/resolvex/remediation/*.test.ts`                       | jest                      |
| Executor success/failure/rollback                      | `tests/resolvex/remediation/*.test.ts`                       | jest                      |
| Verification pass → resolved; fail → investigating     | `tests/resolvex/verification/*.test.ts`                      | jest                      |
| API endpoints (create → … → verify)                    | `tests/resolvex/api/*.test.ts`                               | jest (in-memory store)    |
| Store contract (both backends)                         | `tests/db/{sqlite,postgres}/resolvex-store/contract.test.ts` | `test:store:*`            |
| **End-to-end** DETECT→…→RESOLVED                       | `tests/resolvex/e2e/incidentLifecycle.test.ts`               | jest                      |
| UI state derivation                                    | `packages/frontend/tests/resolvex/*.test.ts`                 | `tsx --test`              |

The e2e test drives real engine code with a fake LLM and a fake integration — no mocked services,
no asserted-but-unimplemented steps.

---

## 14. Configuration

New keys added to `src/config.ts` (the only env-read owner) and documented in
`packages/trueforge/.env.example`:

```
## ResolveX
# RESOLVEX_ENABLED=true
# RESOLVEX_MODEL_NAME=            # defaults to the tenant's first configured model
# RESOLVEX_CONFIDENCE_THRESHOLD=0.7
# RESOLVEX_MAX_VERIFICATION_ATTEMPTS=3
# RESOLVEX_DEMO_ENABLED=true
```

Model credentials are **not** ResolveX's concern: they come from the existing model-provider
registry (`PUT /api/v1/settings/model-providers`), so `GEMINI_API_KEY` (or any provider key) is
never hard-coded and never lands in ResolveX code. `.env` is git-ignored; `.env.example` carries
placeholders only.

---

## 15. Extensibility

New integration (K8s, AWS, Prometheus, Datadog, …) = implement `IntegrationProvider` and register
its tools with `DevOpsToolRegistry`. Nothing in the incident lifecycle, engine, API or UI changes.

New capability (rollback, auto-scale, postmortem, similarity search) = a new tool and/or a new
engine module under `resolvex/`, not a branch in an existing agent. Multi-agent investigation fits
later by adding a second `DiagnoseLLM` participant — the `Diagnosis` shape already carries
multiple hypotheses with evidence.

---

## 16. Phased plan and gates

| Phase | Deliverable                                                              | Gate                                              |
| ----- | ------------------------------------------------------------------------ | ------------------------------------------------- |
| 0     | This document                                                            | review                                            |
| 1     | `resolvex/` skeleton, config keys, `OpenApiTag.RESOLVEX`, mount point    | typecheck + lint                                  |
| 2     | Domain types, state machine, migrations, store (sqlite + pg), repository | `test:store:sqlite` + `test:store:postgres` green |
| 3     | Incident API + in-memory store for tests                                 | API unit tests green                              |
| 4     | Integration interface + demo provider + evidence collection              | evidence tests green                              |
| 5     | `DiagnoseLLM` adapter (ILLM + fake) + diagnose step                      | diagnosis tests green                             |
| 6     | Root-cause validation + confidence                                       | hallucinated-evidence tests green                 |
| 7     | Tool registry + risk policy + plan builder                               | plan/risk tests green                             |
| 8     | Approve/reject API + audit events                                        | approval tests green                              |
| 9     | Executor (sequential, abort on failure)                                  | executor tests green                              |
| 10    | Verification + `verifying → investigating` loop                          | verification tests green                          |
| 11    | Timeline/audit endpoints + report generation                             | API tests green                                   |
| 12    | Command-center UI (dashboard, incident detail, approval)                 | `typecheck` + `test:frontend`                     |
| 13    | Deterministic demo scenario                                              | demo e2e test green                               |
| 14    | Full test pass                                                           | `pnpm typecheck`, `pnpm lint`, `pnpm test`        |
| 15    | README + SETUP + DEMO + DECISIONS docs                                   | review                                            |

After every phase: `pnpm typecheck && pnpm lint && pnpm test` — a red gate stops the phase.

---

## 17. Risks / open items

- **Dual-backend store cost.** Two migrations + two store impls per table. Mitigated by keeping
  ResolveX to **one** table with a JSONB aggregate.
- **OpenAPI/SDK regeneration.** New routes enter the autogen spec through `openapi:write`; the
  Fern-generated SDK is produced in CI and must not be hand-patched.
- **Windows host.** Nothing in ResolveX requires a host-side sandbox; if a future tool needs shell
  execution it must go through TrueForge's existing sandbox provider (Docker/Daytona), not
  `child_process`.
- **Chat-shell coexistence.** The `/resolvex` branch sits before TrueForgeUI boot; if that branch
  ever grows (shared nav, SSO hand-off), it must keep the auth probe shared rather than duplicated.
