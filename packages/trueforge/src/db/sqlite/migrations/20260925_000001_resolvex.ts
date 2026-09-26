import { sql, type Kysely } from 'kysely';

/**
 * ResolveX incident and dependency-graph tables.
 *
 * `resolvex_incident` stores the full incident aggregate as JSONB in a BLOB
 * column (same pattern as agent/session manifests). The graph is split into
 * `resolvex_graph_node` / `resolvex_graph_edge` so connectivity queries can
 * run in SQL without deserializing the incident document.
 *
 * Demo topology is seeded by the application, not by this migration.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.transaction().execute(async trx => {
    await sql`
      CREATE TABLE resolvex_incident (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL DEFAULT 'demo',
        service TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
        priority INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        document BLOB NOT NULL,
        PRIMARY KEY (id)
      ) STRICT
    `.execute(trx);

    await sql`
      CREATE INDEX resolvex_incident_tenant_idx
        ON resolvex_incident (tenant_id, created_at DESC)
    `.execute(trx);

    await sql`
      CREATE INDEX resolvex_incident_service_idx
        ON resolvex_incident (tenant_id, service, created_at DESC)
    `.execute(trx);

    await sql`
      CREATE INDEX resolvex_incident_state_idx
        ON resolvex_incident (tenant_id, state)
    `.execute(trx);

    await sql`
      CREATE TABLE resolvex_graph_node (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL DEFAULT 'demo',
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        metadata BLOB,
        PRIMARY KEY (id, tenant_id)
      ) STRICT
    `.execute(trx);

    await sql`
      CREATE INDEX resolvex_graph_node_tenant_idx
        ON resolvex_graph_node (tenant_id, type)
    `.execute(trx);

    await sql`
      CREATE TABLE resolvex_graph_edge (
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL DEFAULT 'demo',
        relationship TEXT NOT NULL,
        metadata BLOB,
        PRIMARY KEY (source_id, target_id, tenant_id, relationship),
        FOREIGN KEY (source_id, tenant_id) REFERENCES resolvex_graph_node (id, tenant_id) ON DELETE CASCADE,
        FOREIGN KEY (target_id, tenant_id) REFERENCES resolvex_graph_node (id, tenant_id) ON DELETE CASCADE
      ) STRICT
    `.execute(trx);

    await sql`
      CREATE INDEX resolvex_graph_edge_source_idx
        ON resolvex_graph_edge (tenant_id, source_id)
    `.execute(trx);

    await sql`
      CREATE INDEX resolvex_graph_edge_target_idx
        ON resolvex_graph_edge (tenant_id, target_id)
    `.execute(trx);
  });
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.transaction().execute(async trx => {
    await sql`DROP INDEX IF EXISTS resolvex_graph_edge_target_idx`.execute(trx);
    await sql`DROP INDEX IF EXISTS resolvex_graph_edge_source_idx`.execute(trx);
    await sql`DROP TABLE IF EXISTS resolvex_graph_edge`.execute(trx);
    await sql`DROP INDEX IF EXISTS resolvex_graph_node_tenant_idx`.execute(trx);
    await sql`DROP TABLE IF EXISTS resolvex_graph_node`.execute(trx);
    await sql`DROP INDEX IF EXISTS resolvex_incident_state_idx`.execute(trx);
    await sql`DROP INDEX IF EXISTS resolvex_incident_service_idx`.execute(trx);
    await sql`DROP INDEX IF EXISTS resolvex_incident_tenant_idx`.execute(trx);
    await sql`DROP TABLE IF EXISTS resolvex_incident`.execute(trx);
  });
}
