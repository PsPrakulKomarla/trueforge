/**
 * Deterministic demo service dependency graph.
 *
 * This topology is MOCK data for demonstration purposes only. It mirrors the
 * Phase 1 demo scenario (`payment-api` unhealthy) so that graph-aware
 * investigation has real connectivity to reason over.
 *
 * ```text
 * frontend
 *    │
 *    ▼
 * payment-api
 *    │
 *    ├──► payment-db
 *    ├──► payment-queue
 *    └──► fraud-service
 * ```
 *
 * Every node and edge is created via `graph.addNode` / `graph.addEdge` so the
 * same graph implementation works for real data when a live source is wired in.
 */
import { createServiceGraph, type GraphNode, type ServiceGraph } from './serviceGraph';

export const DEMO_TENANT_ID = 'demo';

export function createDemoServiceGraph(): ServiceGraph {
  const graph = createServiceGraph();
  const addDemoNode = (node: Omit<GraphNode, 'metadata'>) => {
    graph.addNode({ ...node, metadata: { source: 'deterministic-demo' } });
  };

  // Nodes
  addDemoNode({ id: 'frontend', type: 'service', name: 'Frontend Web App' });
  addDemoNode({ id: 'payment-api', type: 'service', name: 'Payment API' });
  addDemoNode({ id: 'payment-db', type: 'database', name: 'Payment Database' });
  addDemoNode({ id: 'payment-queue', type: 'queue', name: 'Payment Queue' });
  addDemoNode({ id: 'fraud-service', type: 'service', name: 'Fraud Detection Service' });
  addDemoNode({ id: 'payment-deployment', type: 'deployment', name: 'Payment API Deployment' });
  addDemoNode({ id: 'load-balancer', type: 'infrastructure', name: 'Ingress Load Balancer' });
  addDemoNode({ id: 'payment-db-instance', type: 'infrastructure', name: 'Payment DB Host' });

  // Edges: what depends on what
  graph.addEdge({ source: 'frontend', target: 'payment-api', relationship: 'depends_on' });
  graph.addEdge({ source: 'frontend', target: 'load-balancer', relationship: 'deployed_to' });

  graph.addEdge({ source: 'payment-api', target: 'payment-db', relationship: 'depends_on' });
  graph.addEdge({ source: 'payment-api', target: 'payment-queue', relationship: 'depends_on' });
  graph.addEdge({ source: 'payment-api', target: 'fraud-service', relationship: 'depends_on' });
  graph.addEdge({ source: 'payment-api', target: 'payment-deployment', relationship: 'deployed_to' });

  graph.addEdge({ source: 'payment-deployment', target: 'load-balancer', relationship: 'deployed_to' });

  graph.addEdge({ source: 'payment-db', target: 'payment-db-instance', relationship: 'deployed_to' });
  graph.addEdge({ source: 'payment-queue', target: 'load-balancer', relationship: 'connected_to' });
  graph.addEdge({ source: 'fraud-service', target: 'load-balancer', relationship: 'connected_to' });

  return graph;
}
