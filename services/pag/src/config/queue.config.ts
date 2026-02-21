// Dynamic queue names based on soulSlug (future use)
export const getInboundQueueName = (soulSlug: string) => `pag-inbound-${soulSlug}`;

export const QUEUE_NAMES = {
  // Static queues
  INBOUND: 'pag-inbound',
  HEARTBEAT: 'pag-heartbeat',
  MEMORY_EXTRACT: 'pag-memory-extract',
  TOKEN_REFRESH: 'pag-token-refresh',
  TASKS: 'pag-tasks',
  
  // Dynamic queue getter (future use)
  getInboundQueue: getInboundQueueName,
};

export const QUEUE_EVENTS = {
  // Inbound message processing
  MESSAGE_RECEIVED: 'message.received',
  
  // Memory processing
  MEMORY_EXTRACT: 'memory.extract',
  
  // Heartbeat processing
  HEARTBEAT_TASK: 'heartbeat.task',
  
  // Token refresh
  TOKEN_REFRESH: 'token.refresh',

  // Task reminders
  TASK_REMIND: 'task.remind',
};
