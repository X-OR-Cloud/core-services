// Metric Types
export const METRIC_TYPES = {
  NODE: 'node',
  RESOURCE: 'resource',
  DEPLOYMENT: 'deployment',
  SYSTEM: 'system',
} as const;

// Aggregation Intervals
export const AGGREGATION_INTERVALS = {
  ONE_MIN: '1min',
  FIVE_MIN: '5min',
  ONE_HOUR: '1hour',
  ONE_DAY: '1day',
} as const;

// Retention Policy (in seconds)
export const RETENTION_POLICY = {
  '1min': 7 * 24 * 60 * 60, // 7 days
  '5min': 30 * 24 * 60 * 60, // 30 days
  '1hour': 90 * 24 * 60 * 60, // 90 days
  '1day': 365 * 24 * 60 * 60, // 365 days
} as const;

// Rate Limits (requests per window in seconds)
export const RATE_LIMITS = {
  NODE_PUSH: { limit: 1, window: 60 }, // 1 req/min
  RESOURCE_PUSH: { limit: 1, window: 300 }, // 1 req/5min
  QUERY: { limit: 10, window: 60 }, // 10 req/min
} as const;

// Aggregation Window Settings
export const AGGREGATION_WINDOWS = {
  '1min-to-5min': {
    sourceInterval: '1min',
    targetInterval: '5min',
    lookbackMinutes: 10, // Look back 10 minutes
  },
  '5min-to-1hour': {
    sourceInterval: '5min',
    targetInterval: '1hour',
    lookbackMinutes: 120, // Look back 2 hours
  },
  '1hour-to-1day': {
    sourceInterval: '1hour',
    targetInterval: '1day',
    lookbackMinutes: 1500, // Look back 25 hours
  },
} as const;

// Entity Status
export const NODE_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  MAINTENANCE: 'maintenance',
} as const;

export const RESOURCE_STATUS = {
  RUNNING: 'running',
  STOPPED: 'stopped',
  RESTARTING: 'restarting',
  ERROR: 'error',
} as const;

export const DEPLOYMENT_HEALTH_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
} as const;

// Resource Types
export const RESOURCE_TYPES = {
  INFERENCE_CONTAINER: 'inference-container',
  APPLICATION_CONTAINER: 'application-container',
  VIRTUAL_MACHINE: 'virtual-machine',
} as const;

// Aggregation Functions
export const AGGREGATION_FUNCTIONS = {
  AVG: 'avg',
  MIN: 'min',
  MAX: 'max',
  SUM: 'sum',
} as const;
