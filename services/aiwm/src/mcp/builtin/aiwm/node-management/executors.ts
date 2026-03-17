/**
 * Executors for NodeManagement tools
 */

import { Logger } from '@nestjs/common';
import { ExecutionContext, ToolResponse } from '../../../types';
import { makeServiceRequest, formatToolResponse, buildQueryString } from '../../../utils';

const logger = new Logger('NodeManagementExecutors');

export async function executeListNodes(
  args: { page?: number; limit?: number; status?: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';

  const queryParams: Record<string, any> = { page: args.page, limit: args.limit };
  if (args.status) queryParams['status'] = args.status;

  const url = `${aiwmBaseUrl}/nodes${buildQueryString(queryParams)}`;
  logger.debug(`ListNodes - URL: ${url}`);

  const response = await makeServiceRequest(url, { method: 'GET', context });
  if (!response.ok) return formatToolResponse(response);

  const data = await response.json();
  if (data.data && Array.isArray(data.data)) {
    data.data = data.data.map((n: any) => ({
      id: n._id ?? n.id,
      name: n.name,
      description: n.description,
      status: n.status,
    }));
  }

  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export async function executeGetNode(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`GetNode - id: ${args.id}`);

  const response = await makeServiceRequest(`${aiwmBaseUrl}/nodes/${args.id}`, {
    method: 'GET',
    context,
  });

  return formatToolResponse(response);
}
