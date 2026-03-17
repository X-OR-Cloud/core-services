/**
 * Zod schemas for NodeManagement tools
 */

import * as z from 'zod';

export const ListNodesSchema = z.object({
  page: z.number().int().positive().optional().default(1).describe('Optional: Page number (default: 1)'),
  limit: z.number().int().positive().max(100).optional().default(20).describe('Optional: Items per page (max 100, default: 20)'),
  status: z
    .enum(['awaiting-approval', 'pending', 'installing', 'online', 'offline', 'maintenance'])
    .optional()
    .describe('Optional: Filter by status. Use "online" to find nodes available for engineer agents.'),
});

export const GetNodeSchema = z.object({
  id: z.string().describe('Node ID to retrieve'),
});
