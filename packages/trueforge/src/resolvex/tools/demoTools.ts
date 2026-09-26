import { z } from 'zod';
import { defineDevOpsTool, type DevOpsTool } from './devopsTool';

const serviceArgs = z.object({ service: z.string().default('payment-api') });
const remediationArgs = z.object({
  service: z.string().default('payment-api'),
  deployment: z.string().default('latest'),
});

export interface DemoEnvironment {
  healthy: Set<string>;
}
export function createDemoEnvironment(): DemoEnvironment {
  return { healthy: new Set() };
}

export function createDemoTools(environment: DemoEnvironment): DevOpsTool[] {
  const health = defineDevOpsTool({
    id: 'get_service_health',
    name: 'Get service health',
    description: 'Read deterministic service health.',
    category: 'diagnostics',
    risk: 'low',
    schema: serviceArgs,
    execute: ({ service }) => {
      const healthy = environment.healthy.has(service);
      return Promise.resolve({
        output: {
          service,
          status: healthy ? 'healthy' : 'unhealthy',
          error_rate: healthy ? 0.005 : 0.18,
          latency_ms: healthy ? 120 : 850,
          health_check: healthy ? 'passing' : 'failing',
        },
        summary: `${service} is ${healthy ? 'healthy' : 'unhealthy'}`,
      });
    },
  });
  const logs = defineDevOpsTool({
    id: 'get_recent_logs',
    name: 'Get recent logs',
    description: 'Read deterministic recent application logs.',
    category: 'diagnostics',
    risk: 'low',
    schema: serviceArgs,
    execute: ({ service }) =>
      Promise.resolve({
        output: {
          service,
          window: '15m',
          entries: ['ERROR database connection timeout', 'ERROR request failed with status 503'],
          error_count: 42,
        },
        summary: `Recent ${service} logs show elevated application errors`,
      }),
  });
  const deployment = defineDevOpsTool({
    id: 'get_recent_deployment',
    name: 'Get recent deployment',
    description: 'Read the latest deterministic deployment.',
    category: 'diagnostics',
    risk: 'low',
    schema: serviceArgs,
    execute: ({ service }) =>
      Promise.resolve({
        output: {
          service,
          deployment: 'deploy-2025-01-15-rollback-candidate',
          version: '2025.01.15',
          deployed_at: '2025-01-15T12:00:00.000Z',
          status: 'succeeded',
        },
        summary: `Latest deployment for ${service} is a rollback candidate`,
      }),
  });
  const inspect = defineDevOpsTool({
    id: 'inspect_repository',
    name: 'Inspect repository',
    description: 'Read deterministic repository metadata.',
    category: 'diagnostics',
    risk: 'low',
    schema: z.object({ repository: z.string().default('trueforge') }),
    execute: ({ repository }) =>
      Promise.resolve({
        output: {
          repository,
          branch: 'main',
          commit: 'demo-commit',
          changed_files: ['services/payment-api/deployment.yaml'],
        },
        summary: `Inspected ${repository} repository`,
      }),
  });
  const remediate = defineDevOpsTool({
    id: 'execute_safe_remediation',
    name: 'Execute safe remediation',
    description: 'Perform a deterministic mock rollback.',
    category: 'remediation',
    risk: 'medium',
    requiredPermissions: ['resolvex:remediate'],
    schema: remediationArgs,
    execute: ({ service, deployment }) => {
      environment.healthy.add(service);
      return Promise.resolve({
        output: { service, action: 'rollback', deployment, mode: 'deterministic-demo', result: 'completed' },
        summary: `Rolled back ${service} to ${deployment}`,
      });
    },
  });
  const verify = defineDevOpsTool({
    id: 'verify_recovery',
    name: 'Verify recovery',
    description: 'Verify deterministic service recovery.',
    category: 'verification',
    risk: 'low',
    schema: serviceArgs,
    execute: ({ service }) => {
      const healthy = environment.healthy.has(service);
      return Promise.resolve({
        output: {
          service,
          status: healthy ? 'healthy' : 'unhealthy',
          checks: { health: healthy, error_rate: healthy },
          error_rate: healthy ? 0.005 : 0.18,
        },
        summary: `${service} recovery verification ${healthy ? 'passed' : 'failed'}`,
      });
    },
  });
  return [health, logs, deployment, inspect, remediate, verify];
}
