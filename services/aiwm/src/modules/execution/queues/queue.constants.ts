/**
 * Queue, Job, and Event naming constants for Workflow Execution
 * Following naming conventions:
 * - Queue names: noun, plural (e.g., 'workflow-executions')
 * - Job names: verb or action (e.g., 'execute-workflow')
 * - Event names: resource:action pattern (e.g., 'workflow-execution:started')
 */

// Queue names (noun, plural)
export const QUEUE_NAMES = {
  WORKFLOW_EXECUTION: 'workflow-executions',
} as const;

// Job names (verb or action)
export const JOB_NAMES = {
  EXECUTE_WORKFLOW: 'execute-workflow',
} as const;

// Workflow template events
export const WORKFLOW_EVENTS = {
  // Workflow template events
  CREATED: 'workflow:created',
  UPDATED: 'workflow:updated',
  ACTIVATED: 'workflow:activated',
  ARCHIVED: 'workflow:archived',
  DELETED: 'workflow:deleted',

  // Workflow trigger
  TRIGGERED: 'workflow:triggered',
} as const;

// Workflow execution events (most important for real-time tracking)
export const WORKFLOW_EXECUTION_EVENTS = {
  // Execution lifecycle
  QUEUED: 'workflow-execution:queued',
  STARTED: 'workflow-execution:started',
  COMPLETED: 'workflow-execution:completed',
  FAILED: 'workflow-execution:failed',

  // Step lifecycle
  STEP_STARTED: 'workflow-execution:step-started',
  STEP_COMPLETED: 'workflow-execution:step-completed',
  STEP_FAILED: 'workflow-execution:step-failed',
} as const;

// Workflow step template events
export const WORKFLOW_STEP_EVENTS = {
  CREATED: 'workflow-step:created',
  UPDATED: 'workflow-step:updated',
  DELETED: 'workflow-step:deleted',
  REORDERED: 'workflow-step:reordered',
} as const;
