/**
 * ResolveX runtime settings.
 *
 * Env reads stay in `src/config.ts` (the server's only `process.env` owner); this
 * module only narrows the resolved server configuration into the shape the
 * ResolveX domain consumes, so engines never reach for `ServerConfiguration`.
 */
import type { ServerConfiguration } from '../config';

export interface ResolvexSettings {
  /** Incident API and engines are mounted when true. */
  enabled: boolean;
  /**
   * Model name for investigation calls. Undefined = the tenant's default resolved
   * model, so ResolveX never names a provider (Gemini today, anything tomorrow).
   */
  modelName: string | undefined;
  /** Diagnosis below this confidence escalates instead of planning a fix. */
  confidenceThreshold: number;
  /** Verification retries before the incident is escalated. */
  maxVerificationAttempts: number;
  /** Every non-read-only remediation step needs an explicit human approval. */
  requireApproval: boolean;
  /** Exposes the seeded demo incident provider. */
  demoEnabled: boolean;
}

export function resolvexSettings(config: ServerConfiguration): ResolvexSettings {
  return {
    enabled: config.RESOLVEX_ENABLED,
    modelName: config.RESOLVEX_MODEL_NAME,
    confidenceThreshold: config.RESOLVEX_CONFIDENCE_THRESHOLD,
    maxVerificationAttempts: config.RESOLVEX_MAX_VERIFICATION_ATTEMPTS,
    requireApproval: config.RESOLVEX_REQUIRE_APPROVAL,
    demoEnabled: config.RESOLVEX_DEMO_ENABLED,
  };
}
