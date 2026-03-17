/**
 * Executors for DeploymentManagement tools
 */

import { Logger } from '@nestjs/common';
import { ExecutionContext, ToolResponse } from '../../../types';
import { makeServiceRequest, formatToolResponse, buildQueryString } from '../../../utils';

const logger = new Logger('DeploymentManagementExecutors');

export async function executeListDeployments(
  args: { page?: number; limit?: number; status?: string; modelId?: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';

  const queryParams: Record<string, any> = { page: args.page, limit: args.limit };
  if (args.status) queryParams['status'] = args.status;
  if (args.modelId) queryParams['modelId'] = args.modelId;

  const url = `${aiwmBaseUrl}/deployments${buildQueryString(queryParams)}`;
  logger.debug(`ListDeployments - URL: ${url}`);

  const response = await makeServiceRequest(url, { method: 'GET', context });
  if (!response.ok) return formatToolResponse(response);

  const data = await response.json();
  if (data.data && Array.isArray(data.data)) {
    data.data = data.data.map((d: any) => ({
      id: d._id ?? d.id,
      name: d.name,
      description: d.description,
      modelId: d.modelId,
      status: d.status,
    }));
  }

  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export async function executeGetDeployment(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`GetDeployment - id: ${args.id}`);

  const response = await makeServiceRequest(`${aiwmBaseUrl}/deployments/${args.id}`, {
    method: 'GET',
    context,
  });

  return formatToolResponse(response);
}
