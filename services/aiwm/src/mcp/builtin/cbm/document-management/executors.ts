/**
 * Executors for DocumentManagement tools
 */

import { Logger } from '@nestjs/common';
import { ExecutionContext, ToolResponse } from '../../../types';
import {
  makeServiceRequest,
  formatToolResponse,
  buildQueryString,
} from '../../../utils';

const logger = new Logger('DocumentManagementExecutors');

/**
 * Helper function to remove unnecessary fields from document object
 * Optimizes token usage for LLM by removing owner, createdBy, updatedBy, __v
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeDocument(doc: any): any {
  if (!doc) return doc;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { owner, createdBy, updatedBy, __v, ...sanitized } = doc;
  return sanitized;
}

/**
 * Helper function to sanitize array of documents
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeDocuments(docs: any[]): any[] {
  if (!Array.isArray(docs)) return docs;
  return docs.map(sanitizeDocument);
}

/**
 * Execute create document
 */
export async function executeCreateDocument(
  args: {
    summary: string;
    content: string;
    type: 'html' | 'text' | 'markdown' | 'json';
    labels?: string[];
    status?: 'draft' | 'published' | 'archived';
  },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    logger.debug(`🔍 CreateDocument executor - cbmBaseUrl from context: ${context.cbmBaseUrl}`);
    logger.debug(`🔍 CreateDocument executor - Using URL: ${cbmBaseUrl}`);

    const response = await makeServiceRequest(`${cbmBaseUrl}/documents`, {
      method: 'POST',
      context,
      body: JSON.stringify(args),
    });

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeDocument(json);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(sanitized, null, 2),
          },
        ],
      };
    }

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error creating document:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error creating document: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute list documents
 */
export async function executeListDocuments(
  args: {
    page?: number;
    limit?: number;
    search?: string;
    type?: 'html' | 'text' | 'markdown' | 'json';
    status?: 'draft' | 'published' | 'archived';
    projectId?: string;
  },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';

    // Build query params — filter fields go into filter JSON object
    const { page, limit, search, ...filterFields } = args;
    const queryParams: Record<string, any> = {};
    if (page !== undefined) queryParams.page = page;
    if (limit !== undefined) queryParams.limit = limit;
    if (search) queryParams.search = search;

    // Pack type, status, projectId into filter JSON
    const filter: Record<string, any> = {};
    for (const [key, value] of Object.entries(filterFields)) {
      if (value !== undefined && value !== null) {
        filter[key] = value;
      }
    }
    if (Object.keys(filter).length > 0) {
      queryParams.filter = JSON.stringify(filter);
    }

    const queryString = buildQueryString(queryParams);
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/documents${queryString}`,
      {
        method: 'GET',
        context,
      }
    );

    // Sanitize response.data to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      // Sanitize the data array if it exists
      if (json.data && Array.isArray(json.data)) {
        json.data = sanitizeDocuments(json.data);
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(json, null, 2),
          },
        ],
      };
    }

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error listing documents:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error listing documents: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute get document by ID
 */
export async function executeGetDocument(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/documents/${args.id}`,
      {
        method: 'GET',
        context,
      }
    );

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeDocument(json);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(sanitized, null, 2),
          },
        ],
      };
    }

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error getting document:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error getting document: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute get document content
 */
export async function executeGetDocumentContent(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/documents/${args.id}/content`,
      {
        method: 'GET',
        context,
      }
    );

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error getting document content:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error getting document content: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute update document metadata
 */
export async function executeUpdateDocument(
  args: {
    id: string;
    summary?: string;
    labels?: string[];
    status?: 'draft' | 'published' | 'archived';
    projectId?: string;
  },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const { id, ...updateData } = args;
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/documents/${id}`,
      {
        method: 'PATCH',
        context,
        body: JSON.stringify(updateData),
      }
    );

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeDocument(json);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(sanitized, null, 2),
          },
        ],
      };
    }

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error updating document:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error updating document: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute update document content
 */
export async function executeUpdateDocumentContent(
  args: {
    id: string;
    operation:
      | 'replace'
      | 'find-replace-text'
      | 'find-replace-regex'
      | 'find-replace-markdown'
      | 'append'
      | 'append-after-text'
      | 'append-to-section';
    content?: string;
    find?: string;
    replace?: string;
    pattern?: string;
    flags?: string;
    section?: string;
    sectionContent?: string;
  },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const { id, ...updateData } = args;
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/documents/${id}/content`,
      {
        method: 'PATCH',
        context,
        body: JSON.stringify(updateData),
      }
    );

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeDocument(json);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(sanitized, null, 2),
          },
        ],
      };
    }

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error updating document content:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error updating document content: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute delete document
 */
export async function executeDeleteDocument(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/documents/${args.id}`,
      {
        method: 'DELETE',
        context,
      }
    );

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error deleting document:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error deleting document: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute replace entire document content
 */
export async function executeReplaceDocumentContent(
  args: { id: string; content: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const { id, content } = args;
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/documents/${id}/content`,
      {
        method: 'PATCH',
        context,
        body: JSON.stringify({
          operation: 'replace',
          content,
        }),
      }
    );

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeDocument(json);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(sanitized, null, 2),
          },
        ],
      };
    }

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error replacing document content:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error replacing document content: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute search and replace text in document
 */
export async function executeSearchAndReplaceTextInDocument(
  args: { id: string; find: string; replace: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const { id, find, replace } = args;
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/documents/${id}/content`,
      {
        method: 'PATCH',
        context,
        body: JSON.stringify({
          operation: 'find-replace-text',
          find,
          replace,
        }),
      }
    );

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeDocument(json);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(sanitized, null, 2),
          },
        ],
      };
    }

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error searching and replacing text in document:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error searching and replacing text: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute search and replace using regex in document
 */
export async function executeSearchAndReplaceRegexInDocument(
  args: { id: string; pattern: string; replace: string; flags?: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const { id, pattern, replace, flags = 'g' } = args;
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/documents/${id}/content`,
      {
        method: 'PATCH',
        context,
        body: JSON.stringify({
          operation: 'find-replace-regex',
          pattern,
          replace,
          flags,
        }),
      }
    );

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeDocument(json);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(sanitized, null, 2),
          },
        ],
      };
    }

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error searching and replacing regex in document:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error searching and replacing regex: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute replace markdown section in document
 */
export async function executeReplaceMarkdownSectionInDocument(
  args: { id: string; section: string; sectionContent: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const { id, section, sectionContent } = args;
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/documents/${id}/content`,
      {
        method: 'PATCH',
        context,
        body: JSON.stringify({
          operation: 'find-replace-markdown',
          section,
          sectionContent,
        }),
      }
    );

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeDocument(json);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(sanitized, null, 2),
          },
        ],
      };
    }

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error replacing markdown section in document:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error replacing markdown section: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute append content to end of document
 */
export async function executeAppendToDocument(
  args: { id: string; content: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const { id, content } = args;
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/documents/${id}/content`,
      {
        method: 'PATCH',
        context,
        body: JSON.stringify({
          operation: 'append',
          content,
        }),
      }
    );

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeDocument(json);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(sanitized, null, 2),
          },
        ],
      };
    }

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error appending to document:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error appending to document: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute append content after specific text in document
 */
export async function executeAppendAfterTextInDocument(
  args: { id: string; find: string; content: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const { id, find, content } = args;
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/documents/${id}/content`,
      {
        method: 'PATCH',
        context,
        body: JSON.stringify({
          operation: 'append-after-text',
          find,
          content,
        }),
      }
    );

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeDocument(json);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(sanitized, null, 2),
          },
        ],
      };
    }

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error appending after text in document:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error appending after text: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute append content to markdown section in document
 */
export async function executeAppendToMarkdownSectionInDocument(
  args: { id: string; section: string; content: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const { id, section, content } = args;
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/documents/${id}/content`,
      {
        method: 'PATCH',
        context,
        body: JSON.stringify({
          operation: 'append-to-section',
          section,
          content,
        }),
      }
    );

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeDocument(json);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(sanitized, null, 2),
          },
        ],
      };
    }

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error appending to markdown section in document:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error appending to markdown section: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
