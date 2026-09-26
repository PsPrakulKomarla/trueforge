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
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

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

/**
 * File-backed store for local/demo deployments. The aggregate remains behind
 * IncidentStore, so a database adapter can replace this without changing the service.
 */
export function createPersistentIncidentStore(filePath: string): IncidentStore {
  // Lazy imports keep the in-memory/browser-compatible module surface small.
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const load = (): Map<string, Incident> => {
    try {
      const raw = fs.readFileSync(filePath, 'utf8') as string;
      const values = JSON.parse(raw) as Incident[];
      return new Map(values.map(incident => [incident.id, incident]));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
      throw error;
    }
  };
  const save = (incidents: Map<string, Incident>) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify([...incidents.values()]), 'utf8');
    fs.renameSync(temporary, filePath);
  };
  return {
    create(incident) { const incidents = load(); if (incidents.has(incident.id)) throw new Error(`Incident already exists: ${incident.id}`); incidents.set(incident.id, structuredClone(incident)); save(incidents); return structuredClone(incident); },
    get(id) { const incident = load().get(id); return incident ? structuredClone(incident) : undefined; },
    update(id, updater) { const incidents = load(); const current = incidents.get(id); if (!current) throw new Error(`Incident not found: ${id}`); const next = updater(structuredClone(current)); incidents.set(id, structuredClone(next)); save(incidents); return structuredClone(next); },
    list() { return [...load().values()].map(structuredClone); },
  };
}
