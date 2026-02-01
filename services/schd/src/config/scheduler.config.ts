/**
 * Scheduler configuration constants
 */

export const SCHEDULER_CONFIG = {
  // Timeout check interval (ms)
  TIMEOUT_CHECK_INTERVAL: 60000, // 1 minute

  // Default job settings
  DEFAULT_TIMEOUT: 300000, // 5 minutes
  DEFAULT_MAX_RETRIES: 3,
  DEFAULT_BACKOFF_MS: 5000,
  DEFAULT_BACKOFF_TYPE: 'exponential' as const,
  DEFAULT_TIMEZONE: 'Asia/Ho_Chi_Minh',
  DEFAULT_PRIORITY: 5,

  // Worker settings
  WORKER_CONCURRENCY: 5,

  // Retry settings
  MAX_RETRY_ATTEMPTS: 10,
  MIN_BACKOFF_MS: 1000,
  MAX_BACKOFF_MS: 3600000, // 1 hour
} as const;

// Job execution status
export const EXECUTION_STATUS = {
  PENDING: 'pending',
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
} as const;

// Trigger types
export const TRIGGER_TYPE = {
  SCHEDULER: 'scheduler',
  MANUAL: 'manual',
} as const;

// Backoff types
export const BACKOFF_TYPE = {
  FIXED: 'fixed',
  EXPONENTIAL: 'exponential',
} as const;

export type ExecutionStatus = typeof EXECUTION_STATUS[keyof typeof EXECUTION_STATUS];
export type TriggerType = typeof TRIGGER_TYPE[keyof typeof TRIGGER_TYPE];
export type BackoffType = typeof BACKOFF_TYPE[keyof typeof BACKOFF_TYPE];
