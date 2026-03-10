/**
 * Zod schemas for ReminderManagement tools
 */

import * as z from 'zod';

/**
 * Schema for adding a reminder
 */
export const AddReminderSchema = z.object({
  content: z
    .string()
    .describe(
      'Short, actionable reminder text. Include: what to check, where, and what to do after. ' +
      'Example: "Check npm install log at /tmp/npm.log. If done, run build."',
    ),
  triggerAt: z
    .string()
    .datetime()
    .optional()
    .describe('Optional: ISO datetime to delay trigger. If omitted, reminder appears on the next heartbeat.'),
});

/**
 * Schema for listing reminders
 */
export const ListRemindersSchema = z.object({
  status: z
    .enum(['pending', 'done', 'all'])
    .optional()
    .default('pending')
    .describe('Optional: Filter by status (default: pending)'),
});

/**
 * Schema for marking a reminder as done
 */
export const DoneReminderSchema = z.object({
  id: z.string().describe('Reminder ID to mark as done. Call this immediately after acting on the reminder.'),
});

/**
 * Schema for deleting a reminder
 */
export const DeleteReminderSchema = z.object({
  id: z.string().describe('Reminder ID to delete permanently.'),
});
