/**
 * Executors for MemoryManagement tools
 */

import { Logger } from '@nestjs/common';
import { ExecutionContext, ToolResponse } from '../../../types';
import { makeServiceRequest, formatToolResponse, buildQueryString } from '../../../utils';

const logger = new Logger('MemoryManagementExecutors');

/**
 * Search memory by keyword (full-text), scoped to calling agent
 */
export async function executeSearchMemory(
  args: { keyword: string; category?: string; limit?: number },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`SearchMemory - agentId: ${context.agentId}, keyword: "${args.keyword}"`);

  const response = await makeServiceRequest(`${aiwmBaseUrl}/agent-memories/search`, {
    method: 'POST',
    context,
    body: JSON.stringify({
      keyword: args.keyword,
      category: args.category,
      limit: args.limit ?? 5,
    }),
  });

  return formatToolResponse(response);
}

/**
 * Upsert a memory entry by (agentId, category, key)
 */
export async function executeUpsertMemory(
  args: { category: string; key: string; content: string; tags?: string[] },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`UpsertMemory - agentId: ${context.agentId}, category: ${args.category}, key: "${args.key}"`);

  const response = await makeServiceRequest(`${aiwmBaseUrl}/agent-memories/upsert`, {
    method: 'PUT',
    context,
    body: JSON.stringify({
      category: args.category,
      key: args.key,
      content: args.content,
      tags: args.tags,
    }),
  });

  return formatToolResponse(response);
}

/**
 * List memory keys (no content) scoped to calling agent
 */
export async function executeListMemoryKeys(
  args: { category?: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`ListMemoryKeys - agentId: ${context.agentId}, category: ${args.category ?? 'all'}`);

  const queryParams: Record<string, any> = {};
  if (args.category) queryParams['category'] = args.category;
  const queryString = buildQueryString(queryParams);

  const response = await makeServiceRequest(`${aiwmBaseUrl}/agent-memories/keys${queryString}`, {
    method: 'GET',
    context,
  });

  return formatToolResponse(response);
}

/**
 * Soft delete a memory entry by category and key
 */
export async function executeDeleteMemory(
  args: { category: string; key: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`DeleteMemory - agentId: ${context.agentId}, category: ${args.category}, key: "${args.key}"`);

  const response = await makeServiceRequest(
    `${aiwmBaseUrl}/agent-memories/${encodeURIComponent(args.category)}/${encodeURIComponent(args.key)}`,
    { method: 'DELETE', context }
  );

  return formatToolResponse(response);
}
