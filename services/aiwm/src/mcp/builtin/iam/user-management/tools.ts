/**
 * UserManagement tool definitions
 */

import { ToolDefinition } from '../../../types';
import { executeListUsers } from './executors';
import { ListUsersSchema } from './schemas';

/**
 * All UserManagement tools
 */
export const UserManagementTools: ToolDefinition[] = [
  {
    name: 'ListUsers',
    description:
      'List users with pagination and filters (username, fullname, phonenumbers, discordUserId, telegramUserId, status, role)',
    type: 'builtin',
    category: 'UserManagement',
    executor: executeListUsers,
    inputSchema: ListUsersSchema,
  },
];
