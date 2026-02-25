/**
 * DocumentManagement tool definitions
 */

import { ToolDefinition } from '../../../types';
import {
  executeCreateDocument,
  executeListDocuments,
  executeGetDocument,
  executeGetDocumentContent,
  executeUpdateDocument,
  executeUpdateDocumentContent,
  executeDeleteDocument,
  executeReplaceDocumentContent,
  executeSearchAndReplaceTextInDocument,
  executeSearchAndReplaceRegexInDocument,
  executeReplaceMarkdownSectionInDocument,
  executeAppendToDocument,
  executeAppendAfterTextInDocument,
  executeAppendToMarkdownSectionInDocument,
  executeShareDocument,
} from './executors';
import {
  CreateDocumentSchema,
  ListDocumentsSchema,
  GetDocumentSchema,
  GetDocumentContentSchema,
  UpdateDocumentSchema,
  UpdateDocumentContentSchema,
  DeleteDocumentSchema,
  ReplaceDocumentContentSchema,
  SearchAndReplaceTextInDocumentSchema,
  SearchAndReplaceRegexInDocumentSchema,
  ReplaceMarkdownSectionInDocumentSchema,
  AppendToDocumentSchema,
  AppendAfterTextInDocumentSchema,
  AppendToMarkdownSectionInDocumentSchema,
  ShareDocumentSchema,
} from './schemas';

/**
 * All DocumentManagement tools
 */
export const DocumentManagementTools: ToolDefinition[] = [
  {
    name: 'CreateDocument',
    description:
      'Create a new document with summary, content, type, and optional labels/status/projectId',
    type: 'builtin',
    category: 'DocumentManagement',
    executor: executeCreateDocument,
    inputSchema: CreateDocumentSchema,
  },
  {
    name: 'ListDocuments',
    description:
      'List documents with pagination, search, and filters (type, status, projectId)',
    type: 'builtin',
    category: 'DocumentManagement',
    executor: executeListDocuments,
    inputSchema: ListDocumentsSchema,
  },
  {
    name: 'GetDocument',
    description: 'Get a specific document by ID with full metadata',
    type: 'builtin',
    category: 'DocumentManagement',
    executor: executeGetDocument,
    inputSchema: GetDocumentSchema,
  },
  {
    name: 'GetDocumentContent',
    description: 'Get document content by ID with appropriate MIME type',
    type: 'builtin',
    category: 'DocumentManagement',
    executor: executeGetDocumentContent,
    inputSchema: GetDocumentContentSchema,
  },
  {
    name: 'UpdateDocument',
    description: 'Update document metadata (summary, labels, status, projectId)',
    type: 'builtin',
    category: 'DocumentManagement',
    executor: executeUpdateDocument,
    inputSchema: UpdateDocumentSchema,
  },
  {
    name: 'UpdateDocumentContent',
    description:
      'Update document content with operations: replace, find-replace, append, etc.',
    type: 'builtin',
    category: 'DocumentManagement',
    executor: executeUpdateDocumentContent,
    inputSchema: UpdateDocumentContentSchema,
  },
  {
    name: 'DeleteDocument',
    description: 'Soft delete a document by ID',
    type: 'builtin',
    category: 'DocumentManagement',
    executor: executeDeleteDocument,
    inputSchema: DeleteDocumentSchema,
  },
  {
    name: 'ReplaceDocumentContent',
    description: 'Replace entire document content with new content',
    type: 'builtin',
    category: 'DocumentManagement',
    executor: executeReplaceDocumentContent,
    inputSchema: ReplaceDocumentContentSchema,
  },
  {
    name: 'SearchAndReplaceTextInDocument',
    description: 'Find and replace text in document (case-sensitive)',
    type: 'builtin',
    category: 'DocumentManagement',
    executor: executeSearchAndReplaceTextInDocument,
    inputSchema: SearchAndReplaceTextInDocumentSchema,
  },
  {
    name: 'SearchAndReplaceRegexInDocument',
    description: 'Find and replace text using regex pattern in document',
    type: 'builtin',
    category: 'DocumentManagement',
    executor: executeSearchAndReplaceRegexInDocument,
    inputSchema: SearchAndReplaceRegexInDocumentSchema,
  },
  {
    name: 'ReplaceMarkdownSectionInDocument',
    description: 'Replace an entire markdown section in document by section heading',
    type: 'builtin',
    category: 'DocumentManagement',
    executor: executeReplaceMarkdownSectionInDocument,
    inputSchema: ReplaceMarkdownSectionInDocumentSchema,
  },
  {
    name: 'AppendToDocument',
    description: 'Append content to the end of document',
    type: 'builtin',
    category: 'DocumentManagement',
    executor: executeAppendToDocument,
    inputSchema: AppendToDocumentSchema,
  },
  {
    name: 'AppendAfterTextInDocument',
    description: 'Append content after a specific text found in document',
    type: 'builtin',
    category: 'DocumentManagement',
    executor: executeAppendAfterTextInDocument,
    inputSchema: AppendAfterTextInDocumentSchema,
  },
  {
    name: 'AppendToMarkdownSectionInDocument',
    description: 'Append content to the end of a markdown section in document',
    type: 'builtin',
    category: 'DocumentManagement',
    executor: executeAppendToMarkdownSectionInDocument,
    inputSchema: AppendToMarkdownSectionInDocumentSchema,
  },
  {
    name: 'ShareDocument',
    description:
      'Create a temporary share link for a document. The link allows viewing without authentication. TTL defaults to 1 hour.',
    type: 'builtin',
    category: 'DocumentManagement',
    executor: executeShareDocument,
    inputSchema: ShareDocumentSchema,
  },
];
