import type { Incident } from '../domain/incident';

export interface IncidentStore {
  create(incident: Incident): Incident;
  get(id: string): Incident | undefined;
  update(id: string, update: (incident: Incident) => Incident): Incident;
  list(): Incident[];
}

export function createInMemoryIncidentStore(): IncidentStore {
  const incidents = new Map<string, Incident>();
  return {
    create(incident) {
      if (incidents.has(incident.id)) throw new Error(`Incident already exists: ${incident.id}`);
      incidents.set(incident.id, structuredClone(incident));
      return structuredClone(incident);
    },
    get(id) {
      const incident = incidents.get(id);
      return incident === undefined ? undefined : structuredClone(incident);
    },
    update(id, update) {
      const current = incidents.get(id);
      if (current === undefined) throw new Error(`Incident not found: ${id}`);
      const next = update(structuredClone(current));
      incidents.set(id, structuredClone(next));
      return structuredClone(next);
    },
    list() {
      return [...incidents.values()].map(incident => structuredClone(incident));
    },
  };
}
