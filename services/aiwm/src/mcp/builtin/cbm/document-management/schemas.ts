/**
 * Zod schemas for DocumentManagement tools
 */

import * as z from 'zod';

// Document type enum
const DocumentTypeEnum = z.enum(['html', 'text', 'markdown', 'json']);

// Document status enum
const DocumentStatusEnum = z.enum(['draft', 'published', 'archived']);

// Content operation type enum
const ContentOperationEnum = z.enum([
  'replace',
  'find-replace-text',
  'find-replace-regex',
  'find-replace-markdown',
  'append',
  'append-after-text',
  'append-to-section',
]);

/**
 * Schema for creating a new document
 */
export const CreateDocumentSchema = z.object({
  summary: z
    .string()
    .max(500)
    .describe('Document title/summary (max 500 characters)'),
  content: z.string().describe('Main document content'),
  type: DocumentTypeEnum.describe('Content type'),
  labels: z
    .array(z.string())
    .describe('Array of labels for categorization (required)'),
  projectId: z
    .string()
    .optional()
    .describe('Project ID to associate this document with'),
});

/**
 * Schema for listing documents
 */
export const ListDocumentsSchema = z.object({
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .default(1)
    .describe('Page number (default: 1)'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(10)
    .describe('Items per page (max 100, default: 10)'),
  search: z.string().optional().describe('Search in summary, content, labels'),
  type: DocumentTypeEnum.optional().describe('Filter by document type'),
  status: DocumentStatusEnum.optional().describe('Filter by status'),
  projectId: z.string().optional().describe('Filter by project ID'),
});

/**
 * Schema for getting a document by ID
 */
export const GetDocumentSchema = z.object({
  id: z.string().describe('Document ID'),
});

/**
 * Schema for getting document content
 */
export const GetDocumentContentSchema = z.object({
  id: z.string().describe('Document ID'),
});

/**
 * Schema for updating document metadata
 */
export const UpdateDocumentSchema = z.object({
  id: z.string().describe('Document ID'),
  summary: z.string().max(500).optional().describe('Updated summary'),
  content: z.string().optional().describe('Updated document content'),
  type: DocumentTypeEnum.optional().describe('Updated content type'),
  labels: z.array(z.string()).optional().describe('Updated labels'),
  status: DocumentStatusEnum.optional().describe('Updated status'),
  projectId: z.string().optional().describe('Updated project ID'),
});

/**
 * Schema for updating document content
 */
export const UpdateDocumentContentSchema = z.object({
  id: z.string().describe('Document ID'),
  operation: ContentOperationEnum.describe('Content manipulation operation'),
  content: z
    .string()
    .optional()
    .describe('New content (for replace, append, append-after-text, append-to-section)'),
  find: z
    .string()
    .optional()
    .describe('Text to find (for find-replace-text, append-after-text)'),
  replace: z
    .string()
    .optional()
    .describe('Replacement text (for find-replace-text, find-replace-regex)'),
  pattern: z
    .string()
    .optional()
    .describe('Regex pattern (for find-replace-regex)'),
  flags: z
    .string()
    .optional()
    .describe('Regex flags (for find-replace-regex, default: g)'),
  section: z
    .string()
    .optional()
    .describe('Markdown heading (for find-replace-markdown, append-to-section)'),
  sectionContent: z
    .string()
    .optional()
    .describe('New section content (for find-replace-markdown)'),
});

/**
 * Schema for deleting a document
 */
export const DeleteDocumentSchema = z.object({
  id: z.string().describe('Document ID to delete'),
});

/**
 * Schema for replacing entire document content
 */
export const ReplaceDocumentContentSchema = z.object({
  id: z.string().describe('Document ID'),
  content: z.string().describe('New content to replace entire document'),
});

/**
 * Schema for search and replace text in document
 */
export const SearchAndReplaceTextInDocumentSchema = z.object({
  id: z.string().describe('Document ID'),
  find: z.string().describe('Text to find'),
  replace: z.string().describe('Replacement text'),
});

/**
 * Schema for search and replace using regex in document
 */
export const SearchAndReplaceRegexInDocumentSchema = z.object({
  id: z.string().describe('Document ID'),
  pattern: z.string().describe('Regex pattern to find'),
  replace: z.string().describe('Replacement text'),
  flags: z.string().optional().default('g').describe('Regex flags (default: g)'),
});

/**
 * Schema for replacing a markdown section in document
 */
export const ReplaceMarkdownSectionInDocumentSchema = z.object({
  id: z.string().describe('Document ID'),
  section: z.string().describe('Markdown section heading to find (e.g., "## API Specification")'),
  sectionContent: z.string().describe('New content for the markdown section'),
});

/**
 * Schema for appending content to end of document
 */
export const AppendToDocumentSchema = z.object({
  id: z.string().describe('Document ID'),
  content: z.string().describe('Content to append to end of document'),
});

/**
 * Schema for appending content after specific text in document
 */
export const AppendAfterTextInDocumentSchema = z.object({
  id: z.string().describe('Document ID'),
  find: z.string().describe('Text to find, content will be appended after this'),
  content: z.string().describe('Content to append after the found text'),
});

/**
 * Schema for appending content to a markdown section in document
 */
export const AppendToMarkdownSectionInDocumentSchema = z.object({
  id: z.string().describe('Document ID'),
  section: z.string().describe('Markdown section heading (e.g., "## API Specification")'),
  content: z.string().describe('Content to append to end of the section'),
});

/**
 * Schema for creating a share link for a document
 */
export const ShareDocumentSchema = z.object({
  id: z.string().describe('Document ID'),
  ttl: z
    .number()
    .int()
    .min(60)
    .max(86400)
    .optional()
    .default(3600)
    .describe('Time to live in seconds (min 60, max 86400, default 3600 = 1 hour)'),
});
