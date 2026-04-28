/**
 * Executors for Knowledge Base MCP tools
 */

import { Logger } from '@nestjs/common';
import { ExecutionContext, ToolResponse } from '../../../types';
import { makeServiceRequest, formatToolResponse, buildQueryString } from '../../../utils';

const logger = new Logger('KnowledgeBaseExecutors');

/**
 * kb_search — Vector search in a knowledge collection (RAG)
 */
export async function executeKbSearch(
  args: {
    query: string;
    collectionId: string;
    topK?: number;
  },
  context: ExecutionContext,
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const { collectionId, ...body } = args;

    const response = await makeServiceRequest(
      `${cbmBaseUrl}/knowledge-collections/${collectionId}/search`,
      {
        method: 'POST',
        context,
        body: JSON.stringify({ query: body.query, topK: body.topK || 5 }),
      },
    );

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error in kb_search:', error);
    return {
      content: [{ type: 'text', text: `Error searching knowledge base: ${error.message}` }],
      isError: true,
    };
  }
}

/**
 * kb_list_collections — List available knowledge collections (org-scoped)
 */
export async function executeKbListCollections(
  args: {
    projectId?: string;
    page?: number;
    limit?: number;
  },
  context: ExecutionContext,
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';

    const queryParams: Record<string, any> = {
      page: args.page || 1,
      limit: args.limit || 20,
    };

    if (args.projectId) {
      queryParams.filter = JSON.stringify({ projectId: args.projectId });
    }

    const queryString = buildQueryString(queryParams);
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/knowledge-collections${queryString}`,
      {
        method: 'GET',
        context,
      },
    );

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      // Strip internal fields to optimize token usage
      if (json.data && Array.isArray(json.data)) {
        json.data = json.data.map((col: any) => {
          const { owner, createdBy, updatedBy, __v, ...rest } = col;
          return rest;
        });
      }
      return { content: [{ type: 'text', text: JSON.stringify(json, null, 2) }] };
    }

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error in kb_list_collections:', error);
    return {
      content: [{ type: 'text', text: `Error listing collections: ${error.message}` }],
      isError: true,
    };
  }
}

/**
 * ListKnowledgeFiles — List files in a collection with optional keyword search
 */
export async function executeListKnowledgeFiles(
  args: { collectionId: string; search?: string; page?: number; limit?: number },
  context: ExecutionContext,
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const queryParams: Record<string, any> = {
      collectionId: args.collectionId,
      page: args.page || 1,
      limit: args.limit || 20,
    };
    if (args.search) queryParams.search = args.search;

    const queryString = buildQueryString(queryParams);
    const response = await makeServiceRequest(`${cbmBaseUrl}/files${queryString}`, { method: 'GET', context });

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      if (json.data && Array.isArray(json.data)) {
        json.data = json.data.map((file: any) => {
          const { rawContent, storageKey, createdBy, updatedBy, __v, ...rest } = file;
          return rest;
        });
      }
      return { content: [{ type: 'text', text: JSON.stringify(json, null, 2) }] };
    }
    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error in ListKnowledgeFiles:', error);
    return {
      content: [{ type: 'text', text: `Error listing knowledge files: ${error.message}` }],
      isError: true,
    };
  }
}

/**
 * UploadKnowledgeFile — Upload text content as a knowledge file into a collection.
 * Supports plain text, markdown, and HTML. For binary files (PDF, DOCX, XLSX),
 * use Bash with curl to call POST /files directly.
 */
export async function executeUploadKnowledgeFile(
  args: { collectionId: string; filename: string; content: string; name?: string },
  context: ExecutionContext,
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';

    const extToMime: Record<string, string> = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.html': 'text/html',
      '.htm': 'text/html',
    };
    const ext = args.filename.slice(args.filename.lastIndexOf('.')).toLowerCase();
    const mimeType = extToMime[ext];
    if (!mimeType) {
      return {
        content: [{ type: 'text', text: `Unsupported file extension: ${ext}. Supported: .txt, .md, .html. For PDF/DOCX/XLSX use Bash with curl to call POST /files directly.` }],
        isError: true,
      };
    }

    const fileBuffer = Buffer.from(args.content, 'utf-8');
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer], { type: mimeType }), args.filename);
    formData.append('purpose', 'knowledge');
    formData.append('ownerKind', 'knowledge-collection');
    formData.append('ownerId', args.collectionId);
    if (args.name) formData.append('name', args.name);

    const response = await fetch(`${cbmBaseUrl}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${context.token}` },
      body: formData,
    });

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const { rawContent, storageKey, createdBy, updatedBy, __v, ...rest } = json;
      return { content: [{ type: 'text', text: JSON.stringify(rest, null, 2) }] };
    }
    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error in UploadKnowledgeFile:', error);
    return {
      content: [{ type: 'text', text: `Error uploading knowledge file: ${error.message}` }],
      isError: true,
    };
  }
}

/**
 * kb_get_file_info — Get metadata of a knowledge file (no rawContent)
 */
export async function executeKbGetFileInfo(
  args: { fileId: string },
  context: ExecutionContext,
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';

    const response = await makeServiceRequest(
      `${cbmBaseUrl}/files/${args.fileId}`,
      {
        method: 'GET',
        context,
      },
    );

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      // Remove heavy/internal fields
      const { owner, createdBy, updatedBy, __v, rawContent, storageKey, ...rest } = json;
      return { content: [{ type: 'text', text: JSON.stringify(rest, null, 2) }] };
    }

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error in kb_get_file_info:', error);
    return {
      content: [{ type: 'text', text: `Error getting file info: ${error.message}` }],
      isError: true,
    };
  }
}
