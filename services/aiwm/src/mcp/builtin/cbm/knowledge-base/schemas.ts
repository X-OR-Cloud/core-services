/**
 * Zod schemas for Knowledge Base MCP tools
 */
import * as z from 'zod';

/**
 * Schema for kb_search tool
 */
export const KbSearchSchema = z.object({
  query: z.string().describe('Natural language query to search for in the knowledge base'),
  collectionId: z.string().describe('Knowledge collection ID to search within'),
  topK: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe('Number of top results to return (default: 5, max: 20)'),
});

/**
 * Schema for kb_list_collections tool
 */
export const KbListCollectionsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Filter collections by project ID (optional)'),
  page: z.number().int().positive().optional().default(1).describe('Page number (default: 1)'),
  limit: z.number().int().positive().max(50).optional().default(20).describe('Items per page (default: 20)'),
});

/**
 * Schema for kb_get_file_info tool
 */
export const KbGetFileInfoSchema = z.object({
  fileId: z.string().describe('Knowledge file ID to get information about'),
});
