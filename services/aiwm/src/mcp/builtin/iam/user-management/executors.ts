/**
 * Executors for UserManagement tools
 */

import { Logger } from '@nestjs/common';
import { ExecutionContext, ToolResponse } from '../../../types';
import {
  makeServiceRequest,
  formatToolResponse,
  buildQueryString,
} from '../../../utils';

const logger = new Logger('UserManagementExecutors');

/**
 * Sanitize user object by removing metadata fields
 */
function sanitizeUser(user: any): any {
  const { owner, createdBy, updatedBy, __v, ...sanitized } = user;
  return sanitized;
}

/**
 * List users with pagination and filters
 */
export async function executeListUsers(
  args: {
    page?: number;
    limit?: number;
    username?: string;
    fullname?: string;
    phonenumbers?: string;
    discordUserId?: string;
    telegramUserId?: string;
    status?: string;
    role?: string;
  },
  context: ExecutionContext
): Promise<ToolResponse> {
  const iamBaseUrl = context.iamBaseUrl || 'http://localhost:3000';
  logger.debug(`🔍 ListUsers executor - iamBaseUrl from context: ${context.iamBaseUrl}`);
  logger.debug(`🔍 ListUsers executor - Using URL: ${iamBaseUrl}`);

  // Build query parameters
  const queryParams: Record<string, any> = {
    page: args.page,
    limit: args.limit,
  };

  // Add filter parameters with filter[] syntax
  if (args.username) {
    queryParams['filter[username]'] = args.username;
  }
  if (args.fullname) {
    queryParams['filter[fullname]'] = args.fullname;
  }
  if (args.phonenumbers) {
    queryParams['filter[phonenumbers]'] = args.phonenumbers;
  }
  if (args.discordUserId) {
    queryParams['filter[metadata.discordUserId]'] = args.discordUserId;
  }
  if (args.telegramUserId) {
    queryParams['filter[metadata.telegramUserId]'] = args.telegramUserId;
  }
  if (args.status) {
    queryParams['filter[status]'] = args.status;
  }
  if (args.role) {
    queryParams['filter[role]'] = args.role;
  }

  const queryString = buildQueryString(queryParams);
  const url = `${iamBaseUrl}/users${queryString}`;

  const response = await makeServiceRequest(url, {
    method: 'GET',
    context,
  });

  if (!response.ok) {
    return formatToolResponse(response);
  }

  const data = await response.json();

  // Sanitize users array if present
  if (data.data && Array.isArray(data.data)) {
    data.data = data.data.map(sanitizeUser);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}
