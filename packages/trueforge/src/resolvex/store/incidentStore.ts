/**
 * IncidentStore: the persistence contract for ResolveX incidents.
 *
 * Two implementations ship:
 * - {@link createInMemoryIncidentStore} — ephemeral, for tests and demos.
 * - SQLite and Postgres adapters — survive process restarts.
 *
 * Both implement the same asynchronous interface so the rest of ResolveX
 * (IncidentService, tests, demo tooling) is storage-agnostic.
 *
 */
import type { Incident } from '../domain/incident';

export interface IncidentStore {
  create(incident: Incident): Promise<Incident>;
  get(id: string): Promise<Incident | undefined>;
  update(id: string, update: (incident: Incident) => Incident): Promise<Incident>;
  list(): Promise<Incident[]>;
}

export class IncidentNotFoundError extends Error {
  constructor(id: string) {
    super(`Incident not found: ${id}`);
    this.name = 'IncidentNotFoundError';
  }
}

export class IncidentStoreConflictError extends Error {
  constructor(id: string) {
    super(`Incident changed during update: ${id}`);
    this.name = 'IncidentStoreConflictError';
  }
}

export function createInMemoryIncidentStore(): IncidentStore {
  const incidents = new Map<string, Incident>();
  return {
    async create(incident) {
      if (incidents.has(incident.id)) {
        throw new Error(`Incident already exists: ${incident.id}`);
      }
      incidents.set(incident.id, structuredClone(incident));
      return structuredClone(incident);
    },
    async get(id) {
      const incident = incidents.get(id);
      return incident === undefined ? undefined : structuredClone(incident);
    },
    async update(id, update) {
      const current = incidents.get(id);
      if (current === undefined) {
        throw new IncidentNotFoundError(id);
      }
      const next = update(structuredClone(current));
      incidents.set(id, structuredClone(next));
      return structuredClone(next);
    },
    async list() {
      return [...incidents.values()].map(incident => structuredClone(incident));
    },
  };
}
