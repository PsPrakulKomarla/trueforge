import { assertExecutionTransition, decideRecovery } from '../../../src/resolvex/domain/execution';

test('execution lifecycle requires bounded recovery transitions', () => {
  expect(() => assertExecutionTransition('waiting_for_approval', 'remediating')).not.toThrow();
  expect(() => assertExecutionTransition('resolved', 'investigating')).toThrow();
});

test('recovery resolves, retries with an alternative, or escalates', () => {
  expect(decideRecovery({ verification: 'passed', attempt: 1, maxAttempts: 3, hasAlternative: true })).toBe('resolved');
  expect(decideRecovery({ verification: 'failed', attempt: 1, maxAttempts: 3, hasAlternative: true })).toBe('retry_investigation');
  expect(decideRecovery({ verification: 'uncertain', attempt: 3, maxAttempts: 3, hasAlternative: true })).toBe('escalated');
  expect(decideRecovery({ verification: 'failed', attempt: 1, maxAttempts: 3, hasAlternative: false })).toBe('escalated');
});
