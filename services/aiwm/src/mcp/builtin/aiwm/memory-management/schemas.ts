/**
 * Zod schemas for MemoryManagement tools
 */

import * as z from 'zod';

const MemoryCategoryEnum = z.enum(['user-preferences', 'decisions', 'notes', 'lessons']);

/**
 * Schema for SearchMemory
 */
export const SearchMemorySchema = z.object({
  keyword: z.string().describe('Required. Full-text search keyword in content and key'),
  category: MemoryCategoryEnum.optional().describe('Optional. Filter by category. If omitted, searches all categories'),
  limit: z.number().int().min(1).max(20).optional().default(5).describe('Optional. Max results (default: 5, max: 20)'),
});

/**
 * Schema for UpsertMemory
 */
export const UpsertMemorySchema = z.object({
  category: MemoryCategoryEnum.describe(
    'Category: user-preferences | decisions | notes | lessons'
  ),
  key: z
    .string()
    .describe(
      'Slug-style unique key within category. Convention: {subject}-{topic} or {YYYY-MM-DD}-{topic}. Example: "dung-report-style", "2026-03-05-jumpserver-selected"'
    ),
  content: z
    .string()
    .max(2000)
    .describe('Short, factual content. Max ~300 chars per entry recommended. Max 2000 chars.'),
  tags: z.array(z.string()).optional().describe('Optional. Tags for additional filtering, e.g. ["infra", "jumpserver"]'),
});

/**
 * Schema for ListMemoryKeys
 */
export const ListMemoryKeysSchema = z.object({
  category: MemoryCategoryEnum.optional().describe('Optional. Filter by category. If omitted, lists all categories'),
});

/**
 * Schema for DeleteMemory
 */
export const DeleteMemorySchema = z.object({
  category: MemoryCategoryEnum.describe('Category of the memory to delete'),
  key: z.string().describe('Key of the memory entry to delete'),
});
