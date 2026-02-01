/**
 * Queue, Job, and Event naming constants for SCHD Service
 * Following naming conventions from AIWM:
 * - Queue names: noun, plural (e.g., 'scheduled-jobs.queue')
 * - Job names: verb or action (e.g., 'trigger-job')
 * - Event names: resource:action pattern (e.g., 'job-execution:completed')
 */

// Queue names
export const QUEUE_NAMES = {
  // SCHD internal queues
  SCHEDULED_JOBS: 'scheduled-jobs.queue',
  JOB_EXECUTIONS: 'job-executions',
  JOB_RESULTS: 'job-results',
} as const;

// Job names (verb or action)
export const JOB_NAMES = {
  TRIGGER_JOB: 'trigger-job',
  CHECK_TIMEOUT: 'check-timeout',
  PROCESS_RESULT: 'process-result',
  RETRY_EXECUTION: 'retry-execution',
} as const;

// Scheduled Job events
export const SCHEDULED_JOB_EVENTS = {
  CREATED: 'scheduled-job:created',
  UPDATED: 'scheduled-job:updated',
  DELETED: 'scheduled-job:deleted',
  ENABLED: 'scheduled-job:enabled',
  DISABLED: 'scheduled-job:disabled',
} as const;

// Job Execution events
export const JOB_EXECUTION_EVENTS = {
  // Lifecycle events
  TRIGGERED: 'job-execution:triggered',
  QUEUED: 'job-execution:queued',
  STARTED: 'job-execution:started',
  COMPLETED: 'job-execution:completed',
  FAILED: 'job-execution:failed',
  TIMEOUT: 'job-execution:timeout',

  // Retry events
  RETRY_SCHEDULED: 'job-execution:retry-scheduled',
  RETRY_EXHAUSTED: 'job-execution:retry-exhausted',
} as const;
