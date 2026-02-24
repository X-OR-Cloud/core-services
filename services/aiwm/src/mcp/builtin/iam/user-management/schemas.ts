/**
 * Zod schemas for UserManagement tools
 */

import * as z from 'zod';

// User status enum
const UserStatusEnum = z.enum(['active', 'inactive', 'blocked']);

// User role enum
const UserRoleEnum = z.enum([
  'organization.owner',
  'organization.editor',
  'organization.viewer',
]);

/**
 * Schema for listing users
 */
export const ListUsersSchema = z.object({
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .default(1)
    .describe('Optional: Page number (default: 1)'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(10)
    .describe('Optional: Items per page (max 100, default: 10)'),
  username: z
    .string()
    .optional()
    .describe('Optional: Filter by username'),
  fullname: z
    .string()
    .optional()
    .describe('Optional: Filter by full name'),
  phonenumbers: z
    .string()
    .optional()
    .describe('Optional: Filter by phone number'),
  discordUserId: z
    .string()
    .optional()
    .describe('Optional: Filter by Discord user ID (metadata.discordUserId)'),
  telegramUserId: z
    .string()
    .optional()
    .describe('Optional: Filter by Telegram user ID (metadata.telegramUserId)'),
  status: UserStatusEnum.optional().describe('Optional: Filter by status (active, inactive, blocked)'),
  role: UserRoleEnum.optional().describe('Optional: Filter by role (organization.owner, organization.editor, organization.viewer)'),
});
