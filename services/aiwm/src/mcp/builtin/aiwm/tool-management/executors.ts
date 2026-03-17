/**
 * Executors for ToolManagement tools
 */

import { Logger } from '@nestjs/common';
import { ExecutionContext, ToolResponse } from '../../../types';
import { makeServiceRequest, formatToolResponse, buildQueryString } from '../../../utils';

const logger = new Logger('ToolManagementExecutors');

/**
 * List tools with minimal fields (id, name, type, description, status)
 */
export async function executeListTools(
  args: { page?: number; limit?: number; type?: string; status?: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';

  const queryParams: Record<string, any> = {
    page: args.page,
    limit: args.limit,
  };
  if (args.type) queryParams['type'] = args.type;
  if (args.status) queryParams['status'] = args.status;

  const queryString = buildQueryString(queryParams);
  const url = `${aiwmBaseUrl}/tools${queryString}`;
  logger.debug(`ListTools - URL: ${url}`);

  const response = await makeServiceRequest(url, { method: 'GET', context });
  if (!response.ok) return formatToolResponse(response);

  const data = await response.json();

  // Return only minimal fields
  if (data.data && Array.isArray(data.data)) {
    data.data = data.data.map((tool: any) => ({
      id: tool._id ?? tool.id,
      name: tool.name,
      type: tool.type,
      description: tool.description,
      status: tool.status,
    }));
  }

  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * List available functions by tool IDs and framework
 */
export async function executeListAvailableFunctions(
  args: { toolIds: string[]; framework?: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  const framework = args.framework || 'claude-agent-sdk';
  const toolIds = args.toolIds.join(',');
  logger.debug(`ListAvailableFunctions - framework: ${framework}, toolIds: ${toolIds}`);

  const url = `${aiwmBaseUrl}/tools/functions?framework=${encodeURIComponent(framework)}&toolIds=${encodeURIComponent(toolIds)}`;
  const response = await makeServiceRequest(url, { method: 'GET', context });

  return formatToolResponse(response);
}
