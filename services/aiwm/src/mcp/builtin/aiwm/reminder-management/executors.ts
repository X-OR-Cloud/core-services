/**
 * Executors for ReminderManagement tools
 *
 * Security: agentId is never accepted from tool arguments.
 * It is always derived from the agent's JWT token via context.accessToken,
 * which the REST controller resolves from the Bearer token.
 *
 * Response sanitization: only fields relevant to the agent are returned.
 * Internal fields (agentId, owner, createdBy, updatedBy, __v) are stripped.
 */

import { Logger } from '@nestjs/common';
import { ExecutionContext, ToolResponse } from '../../../types';
import { makeServiceRequest, formatToolResponse, buildQueryString } from '../../../utils';

const logger = new Logger('ReminderManagementExecutors');

function sanitizeReminder(reminder: any): any {
  if (!reminder) return reminder;
  const { _id, id, content, status, triggerAt, doneAt, createdAt } = reminder;
  return { id: id || _id, content, status, triggerAt, doneAt, createdAt };
}

/**
 * Add a new reminder for the current agent
 */
export async function executeAddReminder(
  args: { content: string; triggerAt?: string },
  context: ExecutionContext,
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`AddReminder - content length: ${args.content?.length}`);

  const body: Record<string, any> = { content: args.content };
  if (args.triggerAt) body.triggerAt = args.triggerAt;

  const response = await makeServiceRequest(`${aiwmBaseUrl}/agents/reminders`, {
    method: 'POST',
    context,
    body: JSON.stringify(body),
  });

  if (!response.ok) return formatToolResponse(response);

  const data = await response.json();
  if (data.data) data.data = sanitizeReminder(data.data);

  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * List reminders for the current agent
 */
export async function executeListReminders(
  args: { status?: 'pending' | 'done' | 'all' },
  context: ExecutionContext,
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`ListReminders - status: ${args.status ?? 'pending'}`);

  const queryParams: Record<string, any> = {};
  if (args.status) queryParams.status = args.status;

  const queryString = buildQueryString(queryParams);
  const response = await makeServiceRequest(`${aiwmBaseUrl}/agents/reminders${queryString}`, {
    method: 'GET',
    context,
  });

  if (!response.ok) return formatToolResponse(response);

  const data = await response.json();
  if (data.reminders && Array.isArray(data.reminders)) {
    data.reminders = data.reminders.map(sanitizeReminder);
  }

  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Mark a reminder as done
 */
export async function executeDoneReminder(
  args: { id: string },
  context: ExecutionContext,
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`DoneReminder - id: ${args.id}`);

  const response = await makeServiceRequest(`${aiwmBaseUrl}/agents/reminders/${args.id}/done`, {
    method: 'POST',
    context,
  });

  if (!response.ok) return formatToolResponse(response);

  const data = await response.json();
  if (data.data) data.data = sanitizeReminder(data.data);

  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Delete a reminder permanently
 */
export async function executeDeleteReminder(
  args: { id: string },
  context: ExecutionContext,
): Promise<ToolResponse> {
  const aiwmBaseUrl = context.aiwmBaseUrl || 'http://localhost:3003';
  logger.debug(`DeleteReminder - id: ${args.id}`);

  const response = await makeServiceRequest(`${aiwmBaseUrl}/agents/reminders/${args.id}`, {
    method: 'DELETE',
    context,
  });

  return formatToolResponse(response);
}
