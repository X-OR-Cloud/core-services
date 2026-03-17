/**
 * Zod schemas for ToolManagement tools
 */

import * as z from 'zod';

const AgentFrameworkEnum = z.enum(['claude-agent-sdk', 'vercel-ai-sdk']);

/**
 * Schema for listing tools (minimal fields)
 */
export const ListToolsSchema = z.object({
  page: z.number().int().positive().optional().default(1).describe('Optional: Page number (default: 1)'),
  limit: z.number().int().positive().max(100).optional().default(20).describe('Optional: Items per page (max 100, default: 20)'),
  type: z.enum(['mcp', 'builtin', 'custom', 'api']).optional().describe('Optional: Filter by tool type'),
  status: z.enum(['active', 'inactive', 'error']).optional().describe('Optional: Filter by status (default: active)'),
});

/**
 * Schema for listing available functions by tool IDs and framework
 */
export const ListAvailableFunctionsSchema = z.object({
  toolIds: z
    .array(z.string())
    .describe('Tool set IDs to look up functions for (use IDs from ListTools)'),
  framework: AgentFrameworkEnum.optional()
    .default('claude-agent-sdk')
    .describe('Optional: Agent framework (default: claude-agent-sdk)'),
});
