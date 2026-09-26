import { type Kysely, type Transaction } from 'kysely';
import { IncidentSchema, type Incident } from '../../resolvex/domain/incident';
import type { GraphStore } from '../../resolvex/graph/graphStore';
import {
  GraphEdgeSchema,
  GraphNodeSchema,
  createServiceGraph,
  type ServiceGraph,
} from '../../resolvex/graph/serviceGraph';
import {
  IncidentNotFoundError,
  IncidentStoreConflictError,
  type IncidentStore,
} from '../../resolvex/store/incidentStore';
import { isUniqueViolation } from './client';
import { json } from './sqlExpressions';
import type { Database } from './types';

export class PostgresResolvexStore implements IncidentStore, GraphStore {
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
          created_at: new Date(row.detected_at),
          updated_at: new Date(row.updated_at),
          document: json(row),
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
      .selectAll()
      .where('tenant_id', '=', this.#tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? undefined : IncidentSchema.parse(row.document);
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
        updated_at: new Date(next.updated_at),
        document: json(next),
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
      .selectAll()
      .where('tenant_id', '=', this.#tenantId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(row => IncidentSchema.parse(row.document));
  }

  async load(): Promise<ServiceGraph> {
    const [nodeRows, edgeRows] = await Promise.all([
      this.#db.selectFrom('resolvex_graph_node').selectAll().where('tenant_id', '=', this.#tenantId).execute(),
      this.#db.selectFrom('resolvex_graph_edge').selectAll().where('tenant_id', '=', this.#tenantId).execute(),
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
    await this.#db.transaction().execute(async (transaction: Transaction<Database>) => {
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
              metadata: node.metadata === undefined ? null : json(node.metadata),
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
              metadata: edge.metadata === undefined ? null : json(edge.metadata),
            })),
          )
          .execute();
      }
    });
  }
}
