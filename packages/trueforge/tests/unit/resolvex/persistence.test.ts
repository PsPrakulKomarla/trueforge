import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateSqliteToLatest } from '../../../src/db/migrateSqlite';
import { createSqliteDb } from '../../../src/db/sqlite/client';
import { SqliteResolvexStore } from '../../../src/db/sqlite/SqliteResolvexStore';
import { createDemoServiceGraph } from '../../../src/resolvex/graph/demoTopology';
import { createIncidentService } from '../../../src/resolvex/services/incidentService';

const settings = {
  enabled: true,
  modelName: undefined,
  confidenceThreshold: 0.7,
  maxVerificationAttempts: 3,
  requireApproval: true,
  demoEnabled: true,
};

test('incident, approvals, audit, timeline, evidence and graph survive SQLite restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'resolvex-store-'));
  const path = join(directory, 'trueforge.sqlite');
  try {
    const firstDb = createSqliteDb(path);
    let incidentId: string;
    try {
      await migrateSqliteToLatest(firstDb);
      const firstStore = new SqliteResolvexStore(firstDb, 'tenant-a');
      await firstStore.save(createDemoServiceGraph());
      const graph = await firstStore.load();
      expect(graph.getDependencies('payment-api').map(node => node.id)).toContain('payment-db');
      expect(graph.getDependents('payment-api').map(node => node.id)).toContain('frontend');
      expect(graph.findPath('frontend', 'payment-db')?.nodes.map(node => node.id)).toEqual([
        'frontend',
        'payment-api',
        'payment-db',
      ]);

      const service = createIncidentService(firstStore, settings, graph, 'tenant-a');
      const created = await service.create();
      incidentId = created.id;
      const pending = await service.investigate(incidentId);
      expect(pending.state).toBe('approval_required');
      expect(pending.graph_evidence.some(evidence => evidence.node_id === 'payment-db')).toBe(true);
      expect(pending.diagnosis?.root_cause_evidence_ids).not.toContain(
        pending.evidence.find(evidence => evidence.kind === 'graph')?.id,
      );
    } finally {
      await firstDb.destroy();
    }

    const secondDb = createSqliteDb(path);
    try {
      const store = new SqliteResolvexStore(secondDb, 'tenant-a');
      const anotherTenant = new SqliteResolvexStore(secondDb, 'tenant-b');
      expect(await anotherTenant.get(incidentId)).toBeUndefined();
      const restored = await store.get(incidentId);
      expect(restored?.state).toBe('approval_required');
      expect(restored?.evidence).toHaveLength(4);
      expect(restored?.approvals).toHaveLength(1);
      expect(restored?.timeline.some(event => event.kind === 'approval_requested')).toBe(true);
      expect(restored?.actions.some(event => event.action === 'get_recent_logs')).toBe(true);
      expect(restored?.graph_evidence.length).toBeGreaterThan(0);
      const graph = await store.load();
      expect(graph.findPath('frontend', 'payment-db')).toBeDefined();

      const service = createIncidentService(store, settings, graph, 'tenant-a');
      const approved = await service.approve(incidentId, 'engineer-a');
      expect(approved.approvals[0]?.decided_by).toBe('engineer-a');
      const completed = await service.remediate(incidentId);
      expect(completed.state).toBe('resolved');
      expect(completed.verification?.status).toBe('passed');
    } finally {
      await secondDb.destroy();
    }

    const thirdDb = createSqliteDb(path);
    try {
      const stored = await new SqliteResolvexStore(thirdDb, 'tenant-a').get(incidentId);
      expect(stored?.state).toBe('resolved');
      expect(stored?.plan?.status).toBe('done');
      expect(stored?.verification?.status).toBe('passed');
      expect(stored?.timeline.some(event => event.kind === 'verification_run')).toBe(true);
      expect(stored?.actions.some(event => event.action === 'execute_safe_remediation')).toBe(true);
    } finally {
      await thirdDb.destroy();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
