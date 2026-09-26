import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIncidentService } from '../../../src/resolvex/services/incidentService';
import { createPersistentIncidentStore } from '../../../src/resolvex/store/incidentStore';

const settings = { enabled: true, modelName: undefined, confidenceThreshold: 0.8, maxVerificationAttempts: 1, requireApproval: true, demoEnabled: true };

test('persists incidents across store recreation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'resolvex-'));
  try {
    const first = createPersistentIncidentStore(join(dir, 'incidents.json'));
    const incident = createIncidentService(first, settings).create({ service: 'payment-api' });
    const second = createPersistentIncidentStore(join(dir, 'incidents.json'));
    expect(second.get(incident.id)?.service).toBe('payment-api');
    expect(second.list()).toHaveLength(1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('does not resolve after failed verification', async () => {
  const service = createIncidentService(createPersistentIncidentStore(join(mkdtempSync(join(tmpdir(), 'resolvex-')), 'incidents.json')), settings);
  const incident = service.create();
  await service.investigate(incident.id);
  const current = service.get(incident.id)!;
  expect(current.state).toBe('approval_required');
  const rejected = service.reject(incident.id);
  expect(rejected.state).toBe('cancelled');
});
