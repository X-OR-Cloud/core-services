/**
 * WorkManagement tool definitions
 */

import { ToolDefinition } from '../../../types';
import {
  executeCreateWork,
  executeListWorks,
  executeGetWork,
  executeUpdateWork,
  executeDeleteWork,
  executeStartWork,
  executeBlockWork,
  executeUnblockWork,
  executeRequestReviewForWork,
  executeCompleteWork,
  executeReopenWork,
  executeCancelWork,
  executeAssignAndTodoWork,
  executeRejectReviewForWork,
  executeGetNextWork,
  executeRecalculateEpicStatus,
} from './executors';
import {
  CreateWorkSchema,
  ListWorksSchema,
  GetWorkSchema,
  UpdateWorkSchema,
  DeleteWorkSchema,
  StartWorkSchema,
  BlockWorkSchema,
  UnblockWorkSchema,
  RequestReviewForWorkSchema,
  CompleteWorkSchema,
  ReopenWorkSchema,
  CancelWorkSchema,
  AssignAndTodoWorkSchema,
  RejectReviewForWorkSchema,
  GetNextWorkSchema,
  RecalculateEpicStatusSchema,
} from './schemas';

/**
 * All WorkManagement tools
 */
export const WorkManagementTools: ToolDefinition[] = [
  {
    name: 'CreateWork',
    description:
      'Create a new work item (epic/task/subtask) with title, description, type, reporter, assignee, projectId, recurrence config, and other metadata',
    type: 'builtin',
    category: 'WorkManagement',
    executor: executeCreateWork,
    inputSchema: CreateWorkSchema,
  },
  {
    name: 'ListWorks',
    description:
      'List works with pagination, search, and filters (type, status, project, reporter, assignee)',
    type: 'builtin',
    category: 'WorkManagement',
    executor: executeListWorks,
    inputSchema: ListWorksSchema,
  },
  {
    name: 'GetWork',
    description: 'Get a specific work by ID with full details',
    type: 'builtin',
    category: 'WorkManagement',
    executor: executeGetWork,
    inputSchema: GetWorkSchema,
  },
  {
    name: 'UpdateWork',
    description:
      'Update work metadata (title, description, assignee, projectId, recurrence, etc.). Cannot update type or status - use workflow action tools instead',
    type: 'builtin',
    category: 'WorkManagement',
    executor: executeUpdateWork,
    inputSchema: UpdateWorkSchema,
  },
  {
    name: 'DeleteWork',
    description: 'Soft delete a work by ID (only allowed when status is done or cancelled)',
    type: 'builtin',
    category: 'WorkManagement',
    executor: executeDeleteWork,
    inputSchema: DeleteWorkSchema,
  },
  {
    name: 'StartWork',
    description: 'Start work - transition from todo to in_progress status',
    type: 'builtin',
    category: 'WorkManagement',
    executor: executeStartWork,
    inputSchema: StartWorkSchema,
  },
  {
    name: 'BlockWork',
    description:
      'Block work with reason - transition from in_progress to blocked status. Requires reason explaining why work is blocked',
    type: 'builtin',
    category: 'WorkManagement',
    executor: executeBlockWork,
    inputSchema: BlockWorkSchema,
  },
  {
    name: 'UnblockWork',
    description: 'Unblock work - transition from blocked to todo status',
    type: 'builtin',
    category: 'WorkManagement',
    executor: executeUnblockWork,
    inputSchema: UnblockWorkSchema,
  },
  {
    name: 'RequestReviewForWork',
    description: 'Request review - transition from in_progress to review status',
    type: 'builtin',
    category: 'WorkManagement',
    executor: executeRequestReviewForWork,
    inputSchema: RequestReviewForWorkSchema,
  },
  {
    name: 'CompleteWork',
    description: 'Complete work - transition from review to done status',
    type: 'builtin',
    category: 'WorkManagement',
    executor: executeCompleteWork,
    inputSchema: CompleteWorkSchema,
  },
  {
    name: 'ReopenWork',
    description: 'Reopen completed work - transition from done to in_progress status',
    type: 'builtin',
    category: 'WorkManagement',
    executor: executeReopenWork,
    inputSchema: ReopenWorkSchema,
  },
  {
    name: 'CancelWork',
    description: 'Cancel work from any status - transition to cancelled status',
    type: 'builtin',
    category: 'WorkManagement',
    executor: executeCancelWork,
    inputSchema: CancelWorkSchema,
  },
  {
    name: 'AssignAndTodoWork',
    description:
      'Assign work to user/agent and move to todo - transition from backlog to todo status',
    type: 'builtin',
    category: 'WorkManagement',
    executor: executeAssignAndTodoWork,
    inputSchema: AssignAndTodoWorkSchema,
  },
  {
    name: 'RejectReviewForWork',
    description:
      'Reject work from review with feedback - transition from review to todo status',
    type: 'builtin',
    category: 'WorkManagement',
    executor: executeRejectReviewForWork,
    inputSchema: RejectReviewForWorkSchema,
  },
  {
    name: 'GetNextWork',
    description:
      'Get the next highest-priority work for a user/agent. Returns work with priority metadata. Priority: 1=Recurring scheduled task, 2=Subtask, 3=Task, 4=Blocked (reported), 5=Review (reported), 0=No work',
    type: 'builtin',
    category: 'WorkManagement',
    executor: executeGetNextWork,
    inputSchema: GetNextWorkSchema,
  },
  {
    name: 'RecalculateEpicStatus',
    description:
      'Recalculate epic status based on child task statuses. Only applies to work items of type=epic',
    type: 'builtin',
    category: 'WorkManagement',
    executor: executeRecalculateEpicStatus,
    inputSchema: RecalculateEpicStatusSchema,
  },
];
