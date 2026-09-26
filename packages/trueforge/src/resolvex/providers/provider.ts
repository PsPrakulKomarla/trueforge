export const PROVIDER_CAPABILITIES = [
  'read_health',
  'read_logs',
  'read_deployments',
  'read_metrics',
  'read_dependencies',
  'read_repository',
  'safe_remediation',
  'verify_recovery',
] as const;
export type ProviderCapability = (typeof PROVIDER_CAPABILITIES)[number];
export interface EnvironmentContext {
  provider: string;
  environment?: string;
  region?: string;
  cluster?: string;
  namespace?: string;
  service?: string;
  repository?: string;
  deployment?: string;
  tenant_id?: string;
}
export interface ProviderStatus {
  provider: string;
  enabled: boolean;
  available: boolean;
  capabilities: ProviderCapability[];
  checked_at: string;
  error?: string;
}
export type ProviderResult<T> =
  | { status: 'ok'; data: T; source: string }
  | { status: 'unavailable' | 'unsupported' | 'error'; source: string; reason: string };
export interface DevOpsProvider {
  readonly id: string;
  readonly kind: 'demo' | 'kubernetes' | 'github' | 'observability' | 'custom';
  readonly capabilities: readonly ProviderCapability[];
  health(this: void): Promise<ProviderStatus>;
  getServiceHealth?(this: void, context: EnvironmentContext): Promise<ProviderResult<Record<string, unknown>>>;
  getRecentLogs?(this: void, context: EnvironmentContext): Promise<ProviderResult<Record<string, unknown>>>;
  getRecentDeployment?(this: void, context: EnvironmentContext): Promise<ProviderResult<Record<string, unknown>>>;
  getMetrics?(this: void, context: EnvironmentContext): Promise<ProviderResult<Record<string, unknown>>>;
  getDependencies?(this: void, context: EnvironmentContext): Promise<ProviderResult<Record<string, unknown>>>;
  inspectRepository?(this: void, context: EnvironmentContext): Promise<ProviderResult<Record<string, unknown>>>;
  executeSafeRemediation?(
    this: void,
    context: EnvironmentContext,
    action: string,
  ): Promise<ProviderResult<Record<string, unknown>>>;
  verifyRecovery?(this: void, context: EnvironmentContext): Promise<ProviderResult<Record<string, unknown>>>;
}
export function unavailableResult<T>(provider: string, capability: ProviderCapability): ProviderResult<T> {
  return { status: 'unavailable', source: provider, reason: `${capability} provider capability is not configured` };
}
export function unsupportedResult<T>(provider: string, capability: ProviderCapability): ProviderResult<T> {
  return { status: 'unsupported', source: provider, reason: `${provider} does not support ${capability}` };
}
