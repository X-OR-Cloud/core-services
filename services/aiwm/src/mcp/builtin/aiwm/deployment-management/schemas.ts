/**
 * Zod schemas for DeploymentManagement tools
 */

import * as z from 'zod';

export const ListDeploymentsSchema = z.object({
  page: z.number().int().positive().optional().default(1).describe('Optional: Page number (default: 1)'),
  limit: z.number().int().positive().max(100).optional().default(20).describe('Optional: Items per page (max 100, default: 20)'),
  status: z
    .enum(['queued', 'deploying', 'running', 'stopping', 'stopped', 'failed', 'error'])
    .optional()
    .describe('Optional: Filter by status. Use "running" to find deployments available for assistant agents.'),
  modelId: z.string().optional().describe('Optional: Filter by model ID'),
});

export const GetDeploymentSchema = z.object({
  id: z.string().describe('Deployment ID to retrieve'),
});
