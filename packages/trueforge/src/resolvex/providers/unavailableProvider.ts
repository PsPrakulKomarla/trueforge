import type { DevOpsProvider, ProviderCapability, ProviderResult, ProviderStatus } from './provider';
import { unavailableResult } from './provider';

export function createUnavailableProvider(id: string, capabilities: ProviderCapability[] = []): DevOpsProvider {
  const result = <T>(capability: ProviderCapability): ProviderResult<T> => unavailableResult(id, capability);
  return {
    id,
    kind: 'custom',
    capabilities,
    health: (): Promise<ProviderStatus> =>
      Promise.resolve({
        provider: id,
        enabled: false,
        available: false,
        capabilities,
        checked_at: new Date().toISOString(),
        error: 'Provider is not configured',
      }),
    getServiceHealth: () => Promise.resolve(result('read_health')),
    getRecentLogs: () => Promise.resolve(result('read_logs')),
    getRecentDeployment: () => Promise.resolve(result('read_deployments')),
    getMetrics: () => Promise.resolve(result('read_metrics')),
    getDependencies: () => Promise.resolve(result('read_dependencies')),
    inspectRepository: () => Promise.resolve(result('read_repository')),
    verifyRecovery: () => Promise.resolve(result('verify_recovery')),
  };
}
