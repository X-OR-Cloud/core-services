/**
 * ReminderManagement tool definitions
 */

import { ToolDefinition } from '../../../types';
import {
  executeAddReminder,
  executeListReminders,
  executeDoneReminder,
  executeDeleteReminder,
} from './executors';
import {
  AddReminderSchema,
  ListRemindersSchema,
  DoneReminderSchema,
  DeleteReminderSchema,
} from './schemas';

/**
 * All ReminderManagement tools
 */
export const ReminderManagementTools: ToolDefinition[] = [
  {
    name: 'AddReminder',
    description:
      'Create a short-term reminder for yourself to act on in the next heartbeat cycle. ' +
      'Use this when you start a background or non-blocking task and need to follow up later. ' +
      'Keep content short and actionable — include what to check, where, and what to do after.',
    type: 'builtin',
    category: 'ReminderManagement',
    executor: executeAddReminder,
    inputSchema: AddReminderSchema,
  },
  {
    name: 'ListReminders',
    description: 'List your reminders. Defaults to pending reminders only.',
    type: 'builtin',
    category: 'ReminderManagement',
    executor: executeListReminders,
    inputSchema: ListRemindersSchema,
  },
  {
    name: 'DoneReminder',
    description:
      'Mark a reminder as done after you have acted on it. ' +
      'Always call this immediately after resolving a reminder to keep your reminder list clean.',
    type: 'builtin',
    category: 'ReminderManagement',
    executor: executeDoneReminder,
    inputSchema: DoneReminderSchema,
  },
  {
    name: 'DeleteReminder',
    description: 'Permanently delete a reminder. Use when a reminder is no longer relevant.',
    type: 'builtin',
    category: 'ReminderManagement',
    executor: executeDeleteReminder,
    inputSchema: DeleteReminderSchema,
  },
];
