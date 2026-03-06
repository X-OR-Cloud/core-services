/**
 * MemoryManagement tool definitions
 */

import { ToolDefinition } from '../../../types';
import {
  executeSearchMemory,
  executeUpsertMemory,
  executeListMemoryKeys,
  executeDeleteMemory,
} from './executors';
import {
  SearchMemorySchema,
  UpsertMemorySchema,
  ListMemoryKeysSchema,
  DeleteMemorySchema,
} from './schemas';

/**
 * All MemoryManagement tools
 */
export const MemoryManagementTools: ToolDefinition[] = [
  {
    name: 'SearchMemory',
    description:
      'Search agent memory by keyword (full-text search in content and key). Use before answering questions about past decisions, user preferences, or special context — do not guess. Optionally filter by category.',
    type: 'builtin',
    category: 'MemoryManagement',
    executor: executeSearchMemory,
    inputSchema: SearchMemorySchema,
  },
  {
    name: 'UpsertMemory',
    description:
      'Save or update a memory entry. Match by (category, key) — creates if not exists, updates if exists. Use after conversations where new factual information should be remembered for future sessions.',
    type: 'builtin',
    category: 'MemoryManagement',
    executor: executeUpsertMemory,
    inputSchema: UpsertMemorySchema,
  },
  {
    name: 'ListMemoryKeys',
    description:
      'List all memory keys (without content) to audit what is stored or avoid duplicate keys before upserting. Optionally filter by category.',
    type: 'builtin',
    category: 'MemoryManagement',
    executor: executeListMemoryKeys,
    inputSchema: ListMemoryKeysSchema,
  },
  {
    name: 'DeleteMemory',
    description:
      'Soft-delete a memory entry by category and key. Use when information is no longer relevant (e.g. task completed, member left team).',
    type: 'builtin',
    category: 'MemoryManagement',
    executor: executeDeleteMemory,
    inputSchema: DeleteMemorySchema,
  },
];
