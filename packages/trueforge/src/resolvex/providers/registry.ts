import type { DevOpsProvider, ProviderCapability, ProviderStatus } from './provider';
export interface DevOpsProviderRegistry {
  register(provider: DevOpsProvider): void;
  get(id: string): DevOpsProvider | undefined;
  has(id: string): boolean;
  list(): DevOpsProvider[];
  capabilities(id: string): ProviderCapability[];
  health(): Promise<ProviderStatus[]>;
}
export function createDevOpsProviderRegistry(providers: DevOpsProvider[] = []): DevOpsProviderRegistry {
  const map = new Map<string, DevOpsProvider>();
  for (const provider of providers) {
    map.set(provider.id, provider);
  }
  return {
    register(provider) {
      if (map.has(provider.id)) {
        throw new Error(`Duplicate DevOps provider: ${provider.id}`);
      }
      map.set(provider.id, provider);
    },
    get: id => map.get(id),
    has: id => map.has(id),
    list: () => [...map.values()],
    capabilities: id => [...(map.get(id)?.capabilities ?? [])],
    health: () => Promise.all([...map.values()].map(provider => provider.health())),
  };
}
