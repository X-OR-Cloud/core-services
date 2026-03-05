/**
 * Executors for InstructionManagement tools
 */

import { Logger } from '@nestjs/common';
import { ExecutionContext, ToolResponse } from '../../../types';
import { makeServiceRequest, formatToolResponse, buildQueryString } from '../../../utils';

const logger = new Logger('InstructionManagementExecutors');

function sanitizeInstruction(instruction: any): any {
  if (!instruction) return instruction;
  const { owner, createdBy, updatedBy, __v, ...sanitized } = instruction;
  return sanitized;
}

/**
 * List instructions with pagination and filters
 */
export async function executeListInstructions(
  args: { page?: number; limit?: number; name?: string; tags?: string; status?: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`ListInstructions - URL: ${aiwmBaseUrl}`);

  const queryParams: Record<string, any> = { page: args.page, limit: args.limit };
  if (args.name) queryParams['name:regex'] = args.name;
  if (args.tags) queryParams['tags:in'] = args.tags;
  if (args.status) queryParams['status'] = args.status;

  const queryString = buildQueryString(queryParams);
  const response = await makeServiceRequest(`${aiwmBaseUrl}/instructions${queryString}`, {
    method: 'GET',
    context,
  });

  if (!response.ok) return formatToolResponse(response);

  const data = await response.json();
  if (data.data && Array.isArray(data.data)) {
    data.data = data.data.map(sanitizeInstruction);
  }

  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Create a new instruction
 */
export async function executeCreateInstruction(
  args: Record<string, any>,
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`CreateInstruction - URL: ${aiwmBaseUrl}`);

  const response = await makeServiceRequest(`${aiwmBaseUrl}/instructions`, {
    method: 'POST',
    context,
    body: JSON.stringify(args),
  });

  if (!response.ok) return formatToolResponse(response);

  const data = await response.json();
  if (data.data) data.data = sanitizeInstruction(data.data);

  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Update an existing instruction
 */
export async function executeUpdateInstruction(
  args: { id: string; [key: string]: any },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  const { id, ...body } = args;
  logger.debug(`UpdateInstruction - id: ${id}`);

  const response = await makeServiceRequest(`${aiwmBaseUrl}/instructions/${id}`, {
    method: 'PUT',
    context,
    body: JSON.stringify(body),
  });

  if (!response.ok) return formatToolResponse(response);

  const data = await response.json();
  if (data.data) data.data = sanitizeInstruction(data.data);

  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Delete an instruction (soft delete)
 */
export async function executeDeleteInstruction(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`DeleteInstruction - id: ${args.id}`);

  const response = await makeServiceRequest(`${aiwmBaseUrl}/instructions/${args.id}`, {
    method: 'DELETE',
    context,
  });

  return formatToolResponse(response);
}
