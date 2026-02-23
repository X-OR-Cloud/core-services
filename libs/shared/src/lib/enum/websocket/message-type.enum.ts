/**
 * WebSocket message types using resource-based pattern: {resource}.{action}
 *
 * Direction conventions:
 * - Commands (Controller → Worker): Action verbs (create, stop, update, delete)
 * - Events (Worker → Controller): State nouns (status, logs, metrics)
 * - Meta-messages: command.ack, command.result, telemetry.*
 */
export enum MessageType {
  // Connection & Registration
  CONNECTION_ACK = 'connection.ack',
  NODE_REGISTER = 'node.register',
  REGISTER_ACK = 'register.ack',

  // Deployment Commands (Controller → Worker)
  DEPLOYMENT_CREATE = 'deployment.create',
  DEPLOYMENT_STOP = 'deployment.stop',
  DEPLOYMENT_RESTART = 'deployment.restart',
  DEPLOYMENT_UPDATE = 'deployment.update',
  DEPLOYMENT_DELETE = 'deployment.delete',
  DEPLOYMENT_QUERY = 'deployment.query',

  // Deployment Events (Worker → Controller)
  DEPLOYMENT_STATUS = 'deployment.status',
  DEPLOYMENT_LOGS = 'deployment.logs',

  // Model Commands (Controller → Worker)
  MODEL_DOWNLOAD = 'model.download',
  MODEL_CACHE = 'model.cache',
  MODEL_DELETE = 'model.delete',
  MODEL_LIST = 'model.list',

  // Model Events (Worker → Controller)
  MODEL_DOWNLOAD_PROGRESS = 'model.downloadProgress',

  // Job Commands (Controller → Worker) - Future
  JOB_START = 'job.start',
  JOB_STOP = 'job.stop',
  JOB_CANCEL = 'job.cancel',
  JOB_QUERY = 'job.query',

  // Job Events (Worker → Controller) - Future
  JOB_STATUS = 'job.status',

  // Agent Commands (Controller → Worker) - Future
  AGENT_START = 'agent.start',
  AGENT_STOP = 'agent.stop',
  AGENT_DELETE = 'agent.delete',
  AGENT_EXECUTE = 'agent.execute',
  AGENT_QUERY = 'agent.query',

  // Agent Events (Worker → Controller) - Future
  AGENT_MESSAGE = 'agent.message',

  // Container Commands (Controller → Worker)
  CONTAINER_LIST = 'container.list',
  CONTAINER_INSPECT = 'container.inspect',
  CONTAINER_LOGS = 'container.logs',
  CONTAINER_STATS = 'container.stats',

  // System Commands (Controller → Worker)
  SYSTEM_HEALTH_CHECK = 'system.healthCheck',
  SYSTEM_RESTART = 'system.restart',
  SYSTEM_UPDATE = 'system.update',
  SYSTEM_QUERY = 'system.query',

  // Telemetry (Worker → Controller)
  TELEMETRY_HEARTBEAT = 'telemetry.heartbeat',
  TELEMETRY_METRICS = 'telemetry.metrics',

  // Meta-messages (Bidirectional)
  COMMAND_ACK = 'command.ack',
  COMMAND_RESULT = 'command.result',

  // Error
  ERROR = 'error',
}
