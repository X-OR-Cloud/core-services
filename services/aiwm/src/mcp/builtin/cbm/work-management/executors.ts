/**
 * Executors for WorkManagement tools
 */

import { Logger } from '@nestjs/common';
import { ExecutionContext, ToolResponse } from '../../../types';
import {
  makeServiceRequest,
  formatToolResponse,
  buildQueryString,
} from '../../../utils';

const logger = new Logger('WorkManagementExecutors');

/**
 * Helper function to remove unnecessary fields from work object
 * Optimizes token usage for LLM by removing owner, createdBy, updatedBy, __v
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeWork(work: any): any {
  if (!work) return work;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { owner, createdBy, updatedBy, __v, ...sanitized } = work;
  return sanitized;
}

/**
 * Helper function to sanitize array of works
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeWorks(works: any[]): any[] {
  if (!Array.isArray(works)) return works;
  return works.map(sanitizeWork);
}

/**
 * Helper function to parse reporter/assignee format
 * Converts "user:<userId>" or "agent:<agentId>" to { type, id }
 */
function parseReporterAssignee(value: string): { type: 'user' | 'agent'; id: string } {
  const parts = value.split(':');
  if (parts.length !== 2 || (parts[0] !== 'user' && parts[0] !== 'agent')) {
    throw new Error(
      `Invalid reporter/assignee format. Expected "user:<userId>" or "agent:<agentId>", got "${value}"`
    );
  }
  return {
    type: parts[0] as 'user' | 'agent',
    id: parts[1],
  };
}

/**
 * Execute create work
 */
export async function executeCreateWork(
  args: {
    title: string;
    description?: string;
    type: 'epic' | 'task' | 'subtask';
    projectId?: string;
    reporter?: string;
    assignee?: string;
    dueDate?: string;
    startAt?: string;
    dependencies?: string[];
    parentId?: string;
    documents?: string[];
    recurrence?: {
      type: 'interval' | 'daily' | 'weekly' | 'monthly';
      intervalMinutes?: number;
      timesOfDay?: string[];
      daysOfWeek?: number[];
      daysOfMonth?: number[];
      timezone?: string;
    };
  },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';

    // Parse reporter - if not provided, use current agent
    let parsedReporter: { type: 'user' | 'agent'; id: string };
    if (args.reporter) {
      parsedReporter = parseReporterAssignee(args.reporter);
    } else if (context.agentId) {
      // Default to current agent if no reporter provided
      parsedReporter = {
        type: 'agent',
        id: context.agentId,
      };
    } else if (context.userId) {
      // Fallback to current user if no agent
      parsedReporter = {
        type: 'user',
        id: context.userId,
      };
    } else {
      throw new Error('Reporter must be provided or execution context must have agentId/userId');
    }

    const parsedAssignee = args.assignee
      ? parseReporterAssignee(args.assignee)
      : undefined;

    // Build request body
    const requestBody = {
      ...args,
      reporter: parsedReporter,
      assignee: parsedAssignee,
    };

    const response = await makeServiceRequest(`${cbmBaseUrl}/works`, {
      method: 'POST',
      context,
      body: JSON.stringify(requestBody),
    });

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeWork(json);
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
    logger.error('Error creating work:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error creating work: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute list works
 */
export async function executeListWorks(
  args: {
    page?: number;
    limit?: number;
    search?: string;
    type?: 'epic' | 'task' | 'subtask';
    status?: string;
    projectId?: string;
    reporter?: string;
    assignee?: string;
  },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';

    // Build filter object from individual filter params
    const filter: Record<string, any> = {};
    if (args.type) filter.type = args.type;
    if (args.status) filter.status = args.status;
    if (args.projectId) filter.projectId = args.projectId;
    if (args.reporter) {
      const parsed = parseReporterAssignee(args.reporter);
      filter['reporter.type'] = parsed.type;
      filter['reporter.id'] = parsed.id;
    }
    if (args.assignee) {
      const parsed = parseReporterAssignee(args.assignee);
      filter['assignee.type'] = parsed.type;
      filter['assignee.id'] = parsed.id;
    }

    // Build query params: page, limit, search, filter (JSON object)
    const queryParams: Record<string, any> = {};
    if (args.page) queryParams.page = args.page;
    if (args.limit) queryParams.limit = args.limit;
    if (args.search) queryParams.search = args.search;
    if (Object.keys(filter).length > 0) queryParams.filter = JSON.stringify(filter);

    const queryString = buildQueryString(queryParams);
    const response = await makeServiceRequest(`${cbmBaseUrl}/works${queryString}`, {
      method: 'GET',
      context,
    });

    // Sanitize response.data to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      // Sanitize the data array if it exists
      if (json.data && Array.isArray(json.data)) {
        json.data = sanitizeWorks(json.data);
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
    logger.error('Error listing works:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error listing works: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute get work by ID
 */
export async function executeGetWork(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const response = await makeServiceRequest(`${cbmBaseUrl}/works/${args.id}`, {
      method: 'GET',
      context,
    });

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeWork(json);
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
    logger.error('Error getting work:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error getting work: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute update work metadata
 */
export async function executeUpdateWork(
  args: {
    id: string;
    title?: string;
    description?: string;
    projectId?: string;
    reporter?: string;
    assignee?: string;
    dueDate?: string;
    startAt?: string;
    dependencies?: string[];
    parentId?: string;
    documents?: string[];
    recurrence?: {
      type: 'interval' | 'daily' | 'weekly' | 'monthly';
      intervalMinutes?: number;
      timesOfDay?: string[];
      daysOfWeek?: number[];
      daysOfMonth?: number[];
      timezone?: string;
    } | null;
  },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const { id, reporter, assignee, ...otherFields } = args;

    // Parse reporter and assignee if provided
    const parsedReporter = reporter ? parseReporterAssignee(reporter) : undefined;
    const parsedAssignee = assignee ? parseReporterAssignee(assignee) : undefined;

    // Build update data
    const updateData: any = { ...otherFields };
    if (parsedReporter) updateData.reporter = parsedReporter;
    if (parsedAssignee) updateData.assignee = parsedAssignee;

    const response = await makeServiceRequest(`${cbmBaseUrl}/works/${id}`, {
      method: 'PATCH',
      context,
      body: JSON.stringify(updateData),
    });

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeWork(json);
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
    logger.error('Error updating work:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error updating work: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute delete work
 */
export async function executeDeleteWork(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const response = await makeServiceRequest(`${cbmBaseUrl}/works/${args.id}`, {
      method: 'DELETE',
      context,
    });

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error('Error deleting work:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error deleting work: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute start work
 */
export async function executeStartWork(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const response = await makeServiceRequest(`${cbmBaseUrl}/works/${args.id}/start`, {
      method: 'POST',
      context,
    });

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeWork(json);
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
    logger.error('Error starting work:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error starting work: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute block work
 */
export async function executeBlockWork(
  args: { id: string; reason: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const { id, reason } = args;
    const response = await makeServiceRequest(`${cbmBaseUrl}/works/${id}/block`, {
      method: 'POST',
      context,
      body: JSON.stringify({ reason }),
    });

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeWork(json);
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
    logger.error('Error blocking work:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error blocking work: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute unblock work
 */
export async function executeUnblockWork(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const response = await makeServiceRequest(`${cbmBaseUrl}/works/${args.id}/unblock`, {
      method: 'POST',
      context,
    });

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeWork(json);
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
    logger.error('Error unblocking work:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error unblocking work: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute request review for work
 */
export async function executeRequestReviewForWork(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/works/${args.id}/request-review`,
      {
        method: 'POST',
        context,
      }
    );

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeWork(json);
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
    logger.error('Error requesting review for work:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error requesting review for work: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute complete work
 */
export async function executeCompleteWork(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const response = await makeServiceRequest(`${cbmBaseUrl}/works/${args.id}/complete`, {
      method: 'POST',
      context,
    });

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeWork(json);
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
    logger.error('Error completing work:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error completing work: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute reopen work
 */
export async function executeReopenWork(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const response = await makeServiceRequest(`${cbmBaseUrl}/works/${args.id}/reopen`, {
      method: 'POST',
      context,
    });

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeWork(json);
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
    logger.error('Error reopening work:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error reopening work: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute cancel work
 */
export async function executeCancelWork(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const response = await makeServiceRequest(`${cbmBaseUrl}/works/${args.id}/cancel`, {
      method: 'POST',
      context,
    });

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeWork(json);
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
    logger.error('Error cancelling work:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error cancelling work: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute assign and move to todo
 */
export async function executeAssignAndTodoWork(
  args: { id: string; assignee: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const { id, assignee } = args;

    // Parse assignee
    const parsedAssignee = parseReporterAssignee(assignee);

    const response = await makeServiceRequest(
      `${cbmBaseUrl}/works/${id}/assign-and-todo`,
      {
        method: 'POST',
        context,
        body: JSON.stringify({ assignee: parsedAssignee }),
      }
    );

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeWork(json);
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
    logger.error('Error assigning and moving work to todo:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error assigning and moving work to todo: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute reject review
 */
export async function executeRejectReviewForWork(
  args: { id: string; feedback: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const { id, feedback } = args;

    const response = await makeServiceRequest(
      `${cbmBaseUrl}/works/${id}/reject-review`,
      {
        method: 'POST',
        context,
        body: JSON.stringify({ feedback }),
      }
    );

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeWork(json);
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
    logger.error('Error rejecting review for work:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error rejecting review for work: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute get next work (priority-based)
 */
export async function executeGetNextWork(
  args: { assigneeType: 'user' | 'agent'; assigneeId: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const queryString = buildQueryString({
      assigneeType: args.assigneeType,
      assigneeId: args.assigneeId,
    });
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/works/next-work${queryString}`,
      {
        method: 'GET',
        context,
      }
    );

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      if (json.work) {
        json.work = sanitizeWork(json.work);
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
    logger.error('Error getting next work:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error getting next work: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Execute recalculate epic status
 */
export async function executeRecalculateEpicStatus(
  args: { id: string },
  context: ExecutionContext
): Promise<ToolResponse> {
  try {
    const cbmBaseUrl = context.cbmBaseUrl || 'http://localhost:3001';
    const response = await makeServiceRequest(
      `${cbmBaseUrl}/works/${args.id}/recalculate-status`,
      {
        method: 'POST',
        context,
      }
    );

    // Sanitize response to optimize token usage
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const json = await response.json();
      const sanitized = sanitizeWork(json);
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
    logger.error('Error recalculating epic status:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error recalculating epic status: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
