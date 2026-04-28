/**
 * Knowledge Base MCP tool definitions
 */
import { ToolDefinition } from '../../../types';
import {
  executeKbSearch,
  executeKbListCollections,
  executeKbGetFileInfo,
  executeListKnowledgeFiles,
  executeUploadKnowledgeFile,
} from './executors';
import {
  KbSearchSchema,
  KbListCollectionsSchema,
  KbGetFileInfoSchema,
  ListKnowledgeFilesSchema,
  UploadKnowledgeFileSchema,
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
    name: 'UploadKnowledgeFile',
    description:
      'Upload a text file (.txt, .md, .html) into a knowledge collection. The file is queued for embedding automatically. For binary files (PDF, DOCX, XLSX), use Bash with curl to call POST /files directly.',
    type: 'builtin',
    category: 'KnowledgeBase',
    executor: executeUploadKnowledgeFile,
    inputSchema: UploadKnowledgeFileSchema,
  },
];
