import { z } from '@hono/zod-openapi';
import { IncidentSchema, IncidentSummarySchema, SeveritySchema } from '../resolvex/domain/incident';
import { GraphEdgeSchema, GraphNodeSchema } from '../resolvex/graph/serviceGraph';

export const CreateResolvexIncidentRequestSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    severity: SeveritySchema.optional(),
    service: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
  })
  .openapi('CreateResolvexIncidentRequest');

export const GetResolvexIncidentResponseSchema = z
  .object({ data: IncidentSchema })
  .openapi('GetResolvexIncidentResponse');

export const ListResolvexIncidentsResponseSchema = z
  .object({ data: z.array(IncidentSummarySchema) })
  .openapi('ListResolvexIncidentsResponse');

export const ResolvexIncidentGraphSchema = z
  .object({
    incident_id: z.string().min(1),
    is_demo: z.boolean(),
    affected_node: GraphNodeSchema.nullable(),
    dependencies: z.array(GraphNodeSchema),
    dependents: z.array(GraphNodeSchema),
    related_nodes: z.array(GraphNodeSchema),
    nodes: z.array(GraphNodeSchema),
    edges: z.array(GraphEdgeSchema),
  })
  .openapi('ResolvexIncidentGraph');

export const GetResolvexIncidentGraphResponseSchema = z
  .object({ data: ResolvexIncidentGraphSchema })
  .openapi('GetResolvexIncidentGraphResponse');

export type CreateResolvexIncidentRequest = z.infer<typeof CreateResolvexIncidentRequestSchema>;
