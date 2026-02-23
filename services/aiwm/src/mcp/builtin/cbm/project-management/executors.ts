/**
 * Executors for ProjectManagement tools
 */

import { Logger } from '@nestjs/common';
import { ExecutionContext, ToolResponse } from '../../../types';
import {
  makeServiceRequest,
  formatToolResponse,
  buildQueryString,
} from '../../../utils';

const logger = new Logger('ProjectManagementExecutors');

/**
 * Helper function to remove unnecessary fields from project object
 * Optimizes token usage for LLM by removing owner, createdBy, updatedBy, __v
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeProject(doc: any): any {
  if (!doc) return doc;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { owner, createdBy, updatedBy, __v, ...sanitized } = doc;
  return sanitized;
}

/**
 * Helper function to sanitize array of projects
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeProjects(docs: any[]): any[] {
  if (!Array.isArray(docs)) return docs;
  return docs.map(sanitizeProject);
}

/**
 * Execute create project
 */
export async function executeCreateProject(
  args: {
    name: string;
    description?: string;
    members?: string[];
    startDate?: string;
    endDate?: string;
    tags?: string[];
  },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';

    const response = await makeServiceRequest(`${cbmBaseUrl}/projects`, {
      method: 'POST',
      context,
      body: JSON.stringify(args),
    });

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeProject(json);
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
    logger.error('Error creating project:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error creating project: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute list projects
 */
export async function executeListProjects(
  args: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
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

    // Pack status into filter JSON
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
      `${cbmBaseUrl}/projects${queryString}`,
      {
        method: 'GET',
        context,
      }
    );

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      if (json.data && Array.isArray(json.data)) {
        json.data = sanitizeProjects(json.data);
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
    logger.error('Error listing projects:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error listing projects: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute get project by ID
 */
export async function executeGetProject(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/projects/${args.id}`,
      {
        method: 'GET',
        context,
      }
    );

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeProject(json);
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
    logger.error('Error getting project:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error getting project: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute update project metadata
 */
export async function executeUpdateProject(
  args: {
    id: string;
    name?: string;
    description?: string;
    members?: string[];
    startDate?: string;
    endDate?: string;
    tags?: string[];
  },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const { id, ...updateData } = args;
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/projects/${id}`,
      {
        method: 'PATCH',
        context,
        body: JSON.stringify(updateData),
      }
    );

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeProject(json);
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
    logger.error('Error updating project:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error updating project: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute delete project (soft delete — only completed/archived)
 */
export async function executeDeleteProject(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/projects/${args.id}`,
      {
        method: 'DELETE',
        context,
      }
    );

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error deleting project:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error deleting project: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute activate project (draft → active)
 */
export async function executeActivateProject(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  return executeProjectAction(args.id, 'activate', context);
}

/**
 * Execute hold project (active → on_hold)
 */
export async function executeHoldProject(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  return executeProjectAction(args.id, 'hold', context);
}

/**
 * Execute resume project (on_hold → active)
 */
export async function executeResumeProject(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  return executeProjectAction(args.id, 'resume', context);
}

/**
 * Execute complete project (active → completed)
 */
export async function executeCompleteProject(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  return executeProjectAction(args.id, 'complete', context);
}

/**
 * Execute archive project (completed → archived)
 */
export async function executeArchiveProject(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  return executeProjectAction(args.id, 'archive', context);
}

/**
 * Shared helper for project action endpoints
 */
async function executeProjectAction(
  id: string,
  action: string,
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/projects/${id}/${action}`,
      {
        method: 'POST',
        context,
      }
    );

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeProject(json);
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
    logger.error(`Error ${action} project:`, error);
    return {
      content: [
        {
          type: 'text',
          text: `Error ${action} project: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
