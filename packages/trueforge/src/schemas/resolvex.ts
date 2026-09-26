import { z } from '@hono/zod-openapi';
import { IncidentSchema, IncidentSummarySchema, SeveritySchema } from '../resolvex/domain/incident';

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

export type CreateResolvexIncidentRequest = z.infer<typeof CreateResolvexIncidentRequestSchema>;
