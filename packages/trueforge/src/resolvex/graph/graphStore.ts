import { createServiceGraph, type ServiceGraph } from './serviceGraph';

export interface GraphStore {
  load(): Promise<ServiceGraph>;
  save(graph: ServiceGraph): Promise<void>;
}

export function graphFromJSON(input: {
  nodes: ReturnType<ServiceGraph['getNodes']>;
  edges: ReturnType<ServiceGraph['toJSON']>['edges'];
}): ServiceGraph {
  const graph = createServiceGraph();
  for (const node of input.nodes) {
    graph.addNode(node);
  }
  for (const edge of input.edges) {
    graph.addEdge(edge);
  }
  return graph;
}

export function createInMemoryGraphStore(initial: ServiceGraph = createServiceGraph()): GraphStore {
  let data = initial.toJSON();
  return {
    async load() {
      return graphFromJSON(data);
    },
    async save(graph) {
      data = graph.toJSON();
    },
  };
}
