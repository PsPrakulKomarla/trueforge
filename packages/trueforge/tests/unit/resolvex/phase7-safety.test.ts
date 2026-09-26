import { createDevOpsToolRegistry, defineDevOpsTool } from '../../../src/resolvex/tools/devopsTool';
import { z } from 'zod';

test('tool safety metadata is explicit and conservative by default', () => {
  const tool = defineDevOpsTool({ id: 'read', name: 'read', description: 'read', category: 'diagnostics', risk: 'low', schema: z.object({}), execute: async () => ({ output: {}, summary: 'ok' }) });
  expect(tool.mutating).toBe(false);
  expect(tool.requiresApproval).toBe(false);
  expect(tool.retryable).toBe(true);
  expect(tool.idempotent).toBe(false);
  expect(tool.timeoutMs).toBeGreaterThan(0);
});

test('mutating tools are not retryable unless explicitly declared', () => {
  const tool = defineDevOpsTool({ id: 'change', name: 'change', description: 'change', category: 'remediation', risk: 'medium', schema: z.object({}), execute: async () => ({ output: {}, summary: 'ok' }) });
  expect(tool.mutating).toBe(true);
  expect(tool.requiresApproval).toBe(true);
  expect(tool.retryable).toBe(false);
  const registry = createDevOpsToolRegistry(); registry.register(tool); expect(registry.get('change')).toBe(tool);
});
