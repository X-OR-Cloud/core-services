/**
 * Knowledge Base MCP tool definitions
 */
import { ToolDefinition } from '../../../types';
import {
  executeKbSearch,
  executeKbListCollections,
  executeKbGetFileInfo,
  executeListKnowledgeFiles,
  executeAddKnowledgeFile,
} from './executors';
import {
  KbSearchSchema,
  KbListCollectionsSchema,
  KbGetFileInfoSchema,
  ListKnowledgeFilesSchema,
  AddKnowledgeFileSchema,
} from './schemas';

export const KnowledgeBaseTools: ToolDefinition[] = [
  {
    name: 'KnowledgeSearch',
    description:
      'Search a knowledge collection using natural language query (RAG). Returns top-K most relevant chunks with content and metadata. Use this to answer questions based on internal documents.',
    type: 'builtin',
    category: 'KnowledgeBase',
    executor: executeKbSearch,
    inputSchema: KbSearchSchema,
  },
  {
    name: 'ListKnowledgeCollections',
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
  {
    name: 'ListKnowledgeFiles',
    description:
      'List files in a knowledge collection. Supports keyword search by file name or content (case-insensitive). Returns metadata only — no raw content. Use this to browse or find files before reading or referencing them.',
    type: 'builtin',
    category: 'KnowledgeBase',
    executor: executeListKnowledgeFiles,
    inputSchema: ListKnowledgeFilesSchema,
  },
  {
    name: 'AddKnowledgeFile',
    description:
      'Add a file to a knowledge collection from a presigned S3 URL. Supported: .pdf, .docx, .xlsx, .txt, .md, .html. The file is downloaded by CBM and queued for embedding automatically.',
    type: 'builtin',
    category: 'KnowledgeBase',
    executor: executeAddKnowledgeFile,
    inputSchema: AddKnowledgeFileSchema,
  },
];
