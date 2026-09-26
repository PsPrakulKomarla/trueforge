import type { DevOpsProvider, EnvironmentContext, ProviderCapability, ProviderResult } from './provider';

export type ConnectorOperation =
  | 'getServiceHealth'
  | 'getRecentLogs'
  | 'getRecentDeployment'
  | 'getMetrics'
  | 'getDependencies'
  | 'inspectRepository'
  | 'verifyRecovery'
  | 'executeRemediation';

export type ConnectorResult = ProviderResult<Record<string, unknown>> & {
  operation: ConnectorOperation;
  resource?: string;
  dry_run?: boolean;
};

export interface ResolveXConnector {
  readonly id: string;
  readonly provider: DevOpsProvider;
  capabilities(): readonly ProviderCapability[];
  health(): ReturnType<DevOpsProvider['health']>;
  execute(
    operation: ConnectorOperation,
    context: EnvironmentContext,
    options?: { action?: string; dryRun?: boolean },
  ): Promise<ConnectorResult>;
}

const methodFor: Record<Exclude<ConnectorOperation, 'executeRemediation'>, keyof DevOpsProvider> = {
  getServiceHealth: 'getServiceHealth',
  getRecentLogs: 'getRecentLogs',
  getRecentDeployment: 'getRecentDeployment',
  getMetrics: 'getMetrics',
  getDependencies: 'getDependencies',
  inspectRepository: 'inspectRepository',
  verifyRecovery: 'verifyRecovery',
};

function resourceOf(context: EnvironmentContext): { resource: string } | Record<string, never> {
  if (context.service === undefined) {
    return {};
  }
  return { resource: context.service };
}

export function createResolveXConnector(provider: DevOpsProvider): ResolveXConnector {
  return {
    id: provider.id,
    provider,
    capabilities: () => provider.capabilities,
    health: () => provider.health(),
    async execute(operation, context, options = {}) {
      if (operation === 'executeRemediation') {
        if (options.dryRun) {
          return {
            status: 'ok',
            source: provider.id,
            data: { action: options.action ?? 'unspecified', mode: 'dry_run', executed: false },
            operation,
            dry_run: true,
            ...resourceOf(context),
          };
        }
        if (!provider.executeSafeRemediation) {
          return {
            status: 'unsupported',
            source: provider.id,
            reason: 'safe remediation is not supported by this provider',
            operation,
            ...resourceOf(context),
          };
        }
        const result = await provider.executeSafeRemediation(context, options.action ?? '');
        return { ...result, operation, dry_run: false, ...resourceOf(context) };
      }
      const method = provider[methodFor[operation]];
      if (typeof method !== 'function') {
        return {
          status: 'unsupported',
          source: provider.id,
          reason: `${operation} is not supported by this provider`,
          operation,
          ...resourceOf(context),
        };
      }
      const result = await method(context);
      return { ...result, operation, ...resourceOf(context) };
    },
  };
}
