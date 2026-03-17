/**
 * DeploymentManagement tool definitions
 */

import { ToolDefinition } from '../../../types';
import { executeListDeployments, executeGetDeployment } from './executors';
import { ListDeploymentsSchema, GetDeploymentSchema } from './schemas';

export const DeploymentManagementTools: ToolDefinition[] = [
  {
    name: 'ListDeployments',
    description:
      'List model deployments. Filter by status="running" to find deployments available for use as deploymentId in CreateAssistantAgent.',
    type: 'builtin',
    category: 'DeploymentManagement',
    executor: executeListDeployments,
    inputSchema: ListDeploymentsSchema,
  },
  {
    name: 'GetDeployment',
    description: 'Get full details of a deployment by ID including model info, status, and usage stats.',
    type: 'builtin',
    category: 'DeploymentManagement',
    executor: executeGetDeployment,
    inputSchema: GetDeploymentSchema,
  },
];
