/**
 * Executors for AgentManagement tools
 */

import { Logger } from '@nestjs/common';
import { ExecutionContext, ToolResponse } from '../../../types';
import {
  makeServiceRequest,
  formatToolResponse,
  buildQueryString,
} from '../../../utils';

const logger = new Logger('AgentManagementExecutors');

/**
 * Sanitize agent object by removing internal metadata fields
 */
function sanitizeAgent(agent: any): any {
  if (!agent) return agent;
  const { owner, createdBy, updatedBy, __v, secret, ...sanitized } = agent;
  return sanitized;
}

/**
 * Get a single agent by ID
 */
export async function executeGetAgent(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`GetAgent - id: ${args.id}`);

  const response = await makeServiceRequest(`${aiwmBaseUrl}/agents/${args.id}`, {
    method: 'GET',
    context,
  });

  if (!response.ok) return formatToolResponse(response);

  const data = await response.json();
  if (data.data) data.data = sanitizeAgent(data.data);

  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * List agents with pagination and filters
 */
export async function executeListAgents(
  args: {
    page?: number;
    limit?: number;
    name?: string;
    tags?: string;
    description?: string;
    status?: string;
    type?: string;
  },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`ListAgents - URL: ${aiwmBaseUrl}`);

  const queryParams: Record<string, any> = {
    page: args.page,
    limit: args.limit,
  };

  if (args.name) queryParams['name:regex'] = args.name;
  if (args.tags) queryParams['tags:in'] = args.tags;
  if (args.description) queryParams['description:regex'] = args.description;
  if (args.status) queryParams['status'] = args.status;
  if (args.type) queryParams['type'] = args.type;

  const queryString = buildQueryString(queryParams);
  const url = `${aiwmBaseUrl}/agents${queryString}`;

  const response = await makeServiceRequest(url, { method: 'GET', context });

  if (!response.ok) return formatToolResponse(response);

  const data = await response.json();
  if (data.data && Array.isArray(data.data)) {
    data.data = data.data.map(sanitizeAgent);
  }

  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Create a new agent
 */
export async function executeCreateAgent(
  args: Record<string, any>,
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`CreateAgent - URL: ${aiwmBaseUrl}`);

  const response = await makeServiceRequest(`${aiwmBaseUrl}/agents`, {
    method: 'POST',
    context,
    body: JSON.stringify(args),
  });

  if (!response.ok) return formatToolResponse(response);

  const data = await response.json();
  if (data.data) data.data = sanitizeAgent(data.data);

  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Update an existing agent
 */
export async function executeUpdateAgent(
  args: { id: string; [key: string]: any },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  const { id, ...body } = args;
  logger.debug(`UpdateAgent - id: ${id}`);

  const response = await makeServiceRequest(`${aiwmBaseUrl}/agents/${id}`, {
    method: 'PUT',
    context,
    body: JSON.stringify(body),
  });

  if (!response.ok) return formatToolResponse(response);

  const data = await response.json();
  if (data.data) data.data = sanitizeAgent(data.data);

  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Delete an agent (soft delete)
 */
export async function executeDeleteAgent(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`DeleteAgent - id: ${args.id}`);

  const response = await makeServiceRequest(`${aiwmBaseUrl}/agents/${args.id}`, {
    method: 'DELETE',
    context,
  });

  return formatToolResponse(response);
}
