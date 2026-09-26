import { createRoute, z } from '@hono/zod-openapi';
import { RequestErrorResponseSchema } from '../schemas/errors';
import {
  CreateResolvexIncidentRequestSchema,
  GetResolvexIncidentGraphResponseSchema,
  GetResolvexIncidentResponseSchema,
  ListResolvexIncidentsResponseSchema,
} from '../schemas/resolvex';
import { OpenApiTag } from './openapiTags';

export const ResolvexIncidentIdParamsSchema = z.object({
  incident_id: z.string().min(1).describe('Incident identifier.'),
});

const commonErrors = {
  401: {
    content: { 'application/json': { schema: RequestErrorResponseSchema } },
    description: 'Authentication is required.',
  },
  404: {
    content: { 'application/json': { schema: RequestErrorResponseSchema } },
    description: 'The incident was not found.',
  },
  409: {
    content: { 'application/json': { schema: RequestErrorResponseSchema } },
    description: 'The requested action is not valid in the current incident state.',
  },
};

export const createResolvexIncidentRoute = createRoute({
  method: 'post',
  path: '/incidents',
  tags: [OpenApiTag.RESOLVEX],
  summary: 'Create an incident',
  description: 'Creates a detected incident for the authenticated tenant.',
  'x-fern-sdk-group-name': ['resolvex'],
  'x-fern-sdk-method-name': 'create_incident',
  request: {
    body: {
      content: { 'application/json': { schema: CreateResolvexIncidentRequestSchema } },
      required: false,
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: GetResolvexIncidentResponseSchema } },
      description: 'The created incident.',
    },
    400: {
      content: { 'application/json': { schema: RequestErrorResponseSchema } },
      description: 'The request body is invalid.',
    },
    401: commonErrors[401],
  },
});

export const listResolvexIncidentsRoute = createRoute({
  method: 'get',
  path: '/incidents',
  tags: [OpenApiTag.RESOLVEX],
  summary: 'List incidents',
  description: 'Lists incidents for the authenticated tenant.',
  'x-fern-sdk-group-name': ['resolvex'],
  'x-fern-sdk-method-name': 'list_incidents',
  responses: {
    200: {
      content: { 'application/json': { schema: ListResolvexIncidentsResponseSchema } },
      description: 'The tenant incidents.',
    },
    401: commonErrors[401],
  },
});

export const getResolvexIncidentRoute = createRoute({
  method: 'get',
  path: '/incidents/{incident_id}',
  tags: [OpenApiTag.RESOLVEX],
  summary: 'Get an incident',
  description: 'Returns an incident and its investigation record.',
  'x-fern-sdk-group-name': ['resolvex'],
  'x-fern-sdk-method-name': 'get_incident',
  request: { params: ResolvexIncidentIdParamsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: GetResolvexIncidentResponseSchema } },
      description: 'The incident.',
    },
    ...commonErrors,
  },
});

export const getResolvexIncidentGraphRoute = createRoute({
  method: 'get',
  path: '/incidents/{incident_id}/graph',
  tags: [OpenApiTag.RESOLVEX],
  summary: 'Get incident graph context',
  description: 'Returns the affected service and its related dependency graph context.',
  'x-fern-sdk-group-name': ['resolvex'],
  'x-fern-sdk-method-name': 'get_graph',
  request: { params: ResolvexIncidentIdParamsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: GetResolvexIncidentGraphResponseSchema } },
      description: 'The incident graph context.',
    },
    ...commonErrors,
  },
});

function actionRoute(input: { path: string; method: string; summary: string }) {
  return createRoute({
    method: 'post',
    path: input.path,
    tags: [OpenApiTag.RESOLVEX],
    summary: input.summary,
    description: `${input.summary} and returns the updated incident.`,
    'x-fern-sdk-group-name': ['resolvex'],
    'x-fern-sdk-method-name': input.method,
    request: { params: ResolvexIncidentIdParamsSchema },
    responses: {
      200: {
        content: { 'application/json': { schema: GetResolvexIncidentResponseSchema } },
        description: 'The updated incident.',
      },
      ...commonErrors,
    },
  });
}

export const investigateResolvexIncidentRoute = actionRoute({
  path: '/incidents/{incident_id}/investigate',
  method: 'investigate',
  summary: 'Investigate an incident',
});
export const createResolvexRemediationPlanRoute = actionRoute({
  path: '/incidents/{incident_id}/remediation-plan',
  method: 'create_remediation_plan',
  summary: 'Create a remediation plan',
});
export const approveResolvexIncidentRoute = actionRoute({
  path: '/incidents/{incident_id}/approve',
  method: 'approve_remediation',
  summary: 'Approve remediation',
});
export const rejectResolvexIncidentRoute = actionRoute({
  path: '/incidents/{incident_id}/reject',
  method: 'reject_remediation',
  summary: 'Reject remediation',
});
export const remediateResolvexIncidentRoute = actionRoute({
  path: '/incidents/{incident_id}/remediate',
  method: 'remediate',
  summary: 'Execute approved remediation',
});
export const verifyResolvexIncidentRoute = actionRoute({
  path: '/incidents/{incident_id}/verify',
  method: 'verify',
  summary: 'Verify recovery',
});
