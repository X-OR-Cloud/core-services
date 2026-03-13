/**
 * Knowledge Base MCP tool definitions
 */
import { ToolDefinition } from '../../../types';
import {
  executeKbSearch,
  executeKbListCollections,
  executeKbGetFileInfo,
} from './executors';
import {
  KbSearchSchema,
  KbListCollectionsSchema,
  KbGetFileInfoSchema,
} from './schemas';

export const KnowledgeBaseTools: ToolDefinition[] = [
  {
    name: 'kb_search',
    description:
      'Search a knowledge collection using natural language query (RAG). Returns top-K most relevant chunks with content and metadata. Use this to answer questions based on internal documents.',
    type: 'builtin',
    category: 'KnowledgeBase',
    executor: executeKbSearch,
    inputSchema: KbSearchSchema,
  },
  {
    name: 'kb_list_collections',
    description:
      'List available knowledge collections in the organization. Use this to discover which knowledge bases are available before searching.',
    type: 'builtin',
    category: 'KnowledgeBase',
    executor: executeKbListCollections,
    inputSchema: KbListCollectionsSchema,
  },
  {
    name: 'kb_get_file_info',
    description:
      'Get metadata of a knowledge file (name, size, embedding status, chunk count). Does NOT return raw content.',
    type: 'builtin',
    category: 'KnowledgeBase',
    executor: executeKbGetFileInfo,
    inputSchema: KbGetFileInfoSchema,
  },
];
