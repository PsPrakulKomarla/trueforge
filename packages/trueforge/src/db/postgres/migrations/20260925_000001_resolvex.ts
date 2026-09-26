import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    SET LOCAL lock_timeout = '5s';
    CREATE TABLE resolvex_incident (
      id text PRIMARY KEY,
      tenant_id text NOT NULL,
      service text NOT NULL,
      severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
      priority integer NOT NULL DEFAULT 0,
      state text NOT NULL,
      version integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      document jsonb NOT NULL
    );
    CREATE INDEX resolvex_incident_tenant_idx ON resolvex_incident (tenant_id, created_at DESC);
    CREATE INDEX resolvex_incident_service_idx ON resolvex_incident (tenant_id, service, created_at DESC);
    CREATE INDEX resolvex_incident_state_idx ON resolvex_incident (tenant_id, state);
    CREATE TABLE resolvex_graph_node (
      id text NOT NULL,
      tenant_id text NOT NULL,
      type text NOT NULL,
      name text NOT NULL,
      metadata jsonb,
      PRIMARY KEY (id, tenant_id)
    );
    CREATE INDEX resolvex_graph_node_tenant_idx ON resolvex_graph_node (tenant_id, type);
    CREATE TABLE resolvex_graph_edge (
      source_id text NOT NULL,
      target_id text NOT NULL,
      tenant_id text NOT NULL,
      relationship text NOT NULL,
      metadata jsonb,
      PRIMARY KEY (source_id, target_id, tenant_id, relationship),
      FOREIGN KEY (source_id, tenant_id) REFERENCES resolvex_graph_node (id, tenant_id) ON DELETE CASCADE,
      FOREIGN KEY (target_id, tenant_id) REFERENCES resolvex_graph_node (id, tenant_id) ON DELETE CASCADE
    );
    CREATE INDEX resolvex_graph_edge_source_idx ON resolvex_graph_edge (tenant_id, source_id);
    CREATE INDEX resolvex_graph_edge_target_idx ON resolvex_graph_edge (tenant_id, target_id);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    SET LOCAL lock_timeout = '5s';
    DROP TABLE IF EXISTS resolvex_graph_edge;
    DROP TABLE IF EXISTS resolvex_graph_node;
    DROP TABLE IF EXISTS resolvex_incident;
  `.execute(db);
}
