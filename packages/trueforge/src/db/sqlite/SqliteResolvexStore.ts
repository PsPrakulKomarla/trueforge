import { sql, type ExpressionBuilder, type Kysely } from 'kysely';
import { IncidentSchema, type Incident } from '../../resolvex/domain/incident';
import type { GraphStore } from '../../resolvex/graph/graphStore';
import {
  createServiceGraph,
  GraphEdgeSchema,
  GraphNodeSchema,
  type ServiceGraph,
} from '../../resolvex/graph/serviceGraph';
import {
  IncidentNotFoundError,
  IncidentStoreConflictError,
  type IncidentStore,
} from '../../resolvex/store/incidentStore';
import { isUniqueViolation } from './client';
import { jsonbBind, jsonText } from './sqlExpressions';
import type { Database } from './types';

interface IncidentRow {
  id: string;
  tenant_id: string;
  service: string;
  severity: string;
  priority: number;
  state: string;
  version: number;
  created_at: string;
  updated_at: string;
  document: Record<string, unknown>;
}

function incidentColumns(eb: ExpressionBuilder<Database, 'resolvex_incident'>) {
  return [
    'id' as const,
    'tenant_id' as const,
    'service' as const,
    'severity' as const,
    'priority' as const,
    'state' as const,
    'version' as const,
    'created_at' as const,
    'updated_at' as const,
    jsonText<Record<string, unknown>>(eb.ref('document')).as('document'),
  ];
}

function incidentFromRow(row: IncidentRow): Incident {
  return IncidentSchema.parse(row.document);
}

export class SqliteResolvexStore implements IncidentStore, GraphStore {
  readonly #db: Kysely<Database>;
  readonly #tenantId: string;

  constructor(db: Kysely<Database>, tenantId: string) {
    this.#db = db;
    this.#tenantId = tenantId;
  }

  async create(incident: Incident): Promise<Incident> {
    const row = IncidentSchema.parse(incident);
    try {
      await this.#db
        .insertInto('resolvex_incident')
        .values({
          id: row.id,
          tenant_id: this.#tenantId,
          service: row.service,
          severity: row.severity,
          priority: row.priority,
          state: row.state,
          version: row.version,
          created_at: row.detected_at,
          updated_at: row.updated_at,
          document: jsonbBind(row),
        })
        .executeTakeFirstOrThrow();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Error(`Incident already exists: ${row.id}`, { cause: error });
      }
      throw error;
    }
    return structuredClone(row);
  }

  async get(id: string): Promise<Incident | undefined> {
    const row = await this.#db
      .selectFrom('resolvex_incident')
      .select(incidentColumns)
      .where('tenant_id', '=', this.#tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? undefined : incidentFromRow(row);
  }

  async update(id: string, update: (incident: Incident) => Incident): Promise<Incident> {
    const current = await this.get(id);
    if (current === undefined) {
      throw new IncidentNotFoundError(id);
    }
    const next = IncidentSchema.parse(update(structuredClone(current)));
    const result = await this.#db
      .updateTable('resolvex_incident')
      .set({
        service: next.service,
        severity: next.severity,
        priority: next.priority,
        state: next.state,
        version: next.version,
        updated_at: next.updated_at,
        document: jsonbBind(next),
      })
      .where('tenant_id', '=', this.#tenantId)
      .where('id', '=', id)
      .where('version', '=', current.version)
      .returning('id')
      .executeTakeFirst();
    if (result === undefined) {
      throw new IncidentStoreConflictError(id);
    }
    return structuredClone(next);
  }

  async list(): Promise<Incident[]> {
    const rows = await this.#db
      .selectFrom('resolvex_incident')
      .select(incidentColumns)
      .where('tenant_id', '=', this.#tenantId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(incidentFromRow);
  }

  async load(): Promise<ServiceGraph> {
    const [nodeRows, edgeRows] = await Promise.all([
      this.#db
        .selectFrom('resolvex_graph_node')
        .select(['id', 'type', 'name', jsonText<Record<string, unknown> | null>(sql.ref('metadata')).as('metadata')])
        .where('tenant_id', '=', this.#tenantId)
        .execute(),
      this.#db
        .selectFrom('resolvex_graph_edge')
        .select([
          'source_id',
          'target_id',
          'relationship',
          jsonText<Record<string, unknown> | null>(sql.ref('metadata')).as('metadata'),
        ])
        .where('tenant_id', '=', this.#tenantId)
        .execute(),
    ]);
    const graph = createServiceGraph();
    for (const row of nodeRows) {
      graph.addNode(
        GraphNodeSchema.parse({
          id: row.id,
          type: row.type,
          name: row.name,
          ...(row.metadata === null ? {} : { metadata: row.metadata }),
        }),
      );
    }
    for (const row of edgeRows) {
      graph.addEdge(
        GraphEdgeSchema.parse({
          source: row.source_id,
          target: row.target_id,
          relationship: row.relationship,
          ...(row.metadata === null ? {} : { metadata: row.metadata }),
        }),
      );
    }
    return graph;
  }

  async save(graph: ServiceGraph): Promise<void> {
    const { nodes, edges } = graph.toJSON();
    await this.#db.transaction().execute(async transaction => {
      await transaction.deleteFrom('resolvex_graph_edge').where('tenant_id', '=', this.#tenantId).execute();
      await transaction.deleteFrom('resolvex_graph_node').where('tenant_id', '=', this.#tenantId).execute();
      if (nodes.length > 0) {
        await transaction
          .insertInto('resolvex_graph_node')
          .values(
            nodes.map(node => ({
              id: node.id,
              tenant_id: this.#tenantId,
              type: node.type,
              name: node.name,
              metadata: node.metadata === undefined ? null : jsonbBind(node.metadata),
            })),
          )
          .execute();
      }
      if (edges.length > 0) {
        await transaction
          .insertInto('resolvex_graph_edge')
          .values(
            edges.map(edge => ({
              source_id: edge.source,
              target_id: edge.target,
              tenant_id: this.#tenantId,
              relationship: edge.relationship,
              metadata: edge.metadata === undefined ? null : jsonbBind(edge.metadata),
            })),
          )
          .execute();
      }
    });
  }
}
