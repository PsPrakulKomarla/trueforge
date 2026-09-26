import { z } from 'zod';

export const NodeTypeSchema = z.enum(['service', 'deployment', 'database', 'queue', 'external', 'infrastructure']);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const GraphNodeSchema = z
  .object({
    id: z.string().min(1),
    type: NodeTypeSchema,
    name: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('ResolvexGraphNode');
export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const EdgeRelationshipSchema = z.enum(['depends_on', 'deployed_to', 'uses', 'connected_to', 'related']);
export type EdgeRelationship = z.infer<typeof EdgeRelationshipSchema>;

export const GraphEdgeSchema = z
  .object({
    source: z.string().min(1),
    target: z.string().min(1),
    relationship: EdgeRelationshipSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('ResolvexGraphEdge');
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const GraphPathSchema = z
  .object({ nodes: z.array(GraphNodeSchema), edges: z.array(GraphEdgeSchema) })
  .openapi('ResolvexGraphPath');
export type GraphPath = z.infer<typeof GraphPathSchema>;

export interface ServiceGraph {
  readonly nodes: ReadonlyMap<string, GraphNode>;
  readonly edges: ReadonlyMap<string, GraphEdge>;
  addNode(node: GraphNode): void;
  addEdge(edge: GraphEdge): void;
  getNode(id: string): GraphNode | undefined;
  getNodes(): GraphNode[];
  getNeighbors(id: string): GraphNode[];
  getDependencies(id: string): GraphNode[];
  getDependents(id: string): GraphNode[];
  findPath(source: string, target: string): GraphPath | undefined;
  getRelatedNodes(id: string): GraphNode[];
  toJSON(): { nodes: GraphNode[]; edges: GraphEdge[] };
}

function edgeKey(edge: GraphEdge): string {
  return `${edge.source}->${edge.target}::${edge.relationship}`;
}

export function createServiceGraph(): ServiceGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const adjacency = new Map<string, Set<string>>();

  function link(source: string, target: string): void {
    let sourceNeighbors = adjacency.get(source);
    if (sourceNeighbors === undefined) {
      sourceNeighbors = new Set();
      adjacency.set(source, sourceNeighbors);
    }
    let targetNeighbors = adjacency.get(target);
    if (targetNeighbors === undefined) {
      targetNeighbors = new Set();
      adjacency.set(target, targetNeighbors);
    }
    sourceNeighbors.add(target);
    targetNeighbors.add(source);
  }

  return {
    nodes,
    edges,
    addNode(node) {
      nodes.set(node.id, structuredClone(node));
    },
    addEdge(edge) {
      if (!nodes.has(edge.source) || !nodes.has(edge.target)) {
        throw new Error(`Graph edge endpoints must exist: ${edge.source} -> ${edge.target}`);
      }
      const copy = structuredClone(edge);
      edges.set(edgeKey(copy), copy);
      link(copy.source, copy.target);
    },
    getNode(id) {
      const node = nodes.get(id);
      return node === undefined ? undefined : structuredClone(node);
    },
    getNodes() {
      return [...nodes.values()].map(node => structuredClone(node));
    },
    getNeighbors(id) {
      const ids = adjacency.get(id);
      return ids === undefined
        ? []
        : [...ids].flatMap(neighborId => {
            const node = nodes.get(neighborId);
            return node === undefined ? [] : [structuredClone(node)];
          });
    },
    getDependencies(id) {
      return [...edges.values()]
        .filter(edge => edge.source === id && (edge.relationship === 'depends_on' || edge.relationship === 'uses'))
        .flatMap(edge => {
          const node = nodes.get(edge.target);
          return node === undefined ? [] : [structuredClone(node)];
        });
    },
    getDependents(id) {
      return [...edges.values()]
        .filter(edge => edge.target === id && (edge.relationship === 'depends_on' || edge.relationship === 'uses'))
        .flatMap(edge => {
          const node = nodes.get(edge.source);
          return node === undefined ? [] : [structuredClone(node)];
        });
    },
    findPath(source, target) {
      const start = nodes.get(source);
      if (start === undefined) {
        return undefined;
      }
      if (source === target) {
        return { nodes: [structuredClone(start)], edges: [] };
      }
      const visited = new Set([source]);
      const queue: { id: string; path: string[]; edges: GraphEdge[] }[] = [{ id: source, path: [source], edges: [] }];
      while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined) {
          break;
        }
        for (const neighborId of adjacency.get(current.id) ?? []) {
          if (visited.has(neighborId)) {
            continue;
          }
          visited.add(neighborId);
          const edge = [...edges.values()].find(
            candidate =>
              (candidate.source === current.id && candidate.target === neighborId) ||
              (candidate.source === neighborId && candidate.target === current.id),
          );
          const node = nodes.get(neighborId);
          if (edge === undefined || node === undefined) {
            continue;
          }
          const path = [...current.path, neighborId];
          const pathEdges = [...current.edges, structuredClone(edge)];
          if (neighborId === target) {
            const pathNodes = path.flatMap(id => {
              const pathNode = nodes.get(id);
              return pathNode === undefined ? [] : [structuredClone(pathNode)];
            });
            return pathNodes.length === path.length ? { nodes: pathNodes, edges: pathEdges } : undefined;
          }
          queue.push({ id: neighborId, path, edges: pathEdges });
        }
      }
      return undefined;
    },
    getRelatedNodes(id) {
      const node = nodes.get(id);
      return node === undefined ? this.getNeighbors(id) : [structuredClone(node), ...this.getNeighbors(id)];
    },
    toJSON() {
      return {
        nodes: [...nodes.values()].map(node => structuredClone(node)),
        edges: [...edges.values()].map(edge => structuredClone(edge)),
      };
    },
  };
}
