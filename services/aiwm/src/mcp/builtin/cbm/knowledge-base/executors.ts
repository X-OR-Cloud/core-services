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
 * AddKnowledgeFile — Add a file to a KB collection from a presigned S3 URL.
 * CBM handles the download and queues the file for embedding.
 */
export async function executeAddKnowledgeFile(
  args: { collectionId: string; fileUrl: string; filename: string; name?: string },
  context: ExecutionContext,
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const body: Record<string, string> = { fileUrl: args.fileUrl, filename: args.filename };
    if (args.name) body.name = args.name;

    const response = await makeServiceRequest(
      `${cbmBaseUrl}/knowledge-collections/${args.collectionId}/add-file`,
      { method: 'POST', context, body: JSON.stringify(body) },
    );

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const { rawContent, storageKey, createdBy, updatedBy, __v, ...rest } = json;
      return { content: [{ type: 'text', text: JSON.stringify(rest, null, 2) }] };
    }
    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error in AddKnowledgeFile:', error);
    return {
      content: [{ type: 'text', text: `Error adding knowledge file: ${error.message}` }],
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
