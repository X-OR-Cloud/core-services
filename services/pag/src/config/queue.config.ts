export const QUEUE_NAMES = {
  INBOUND: 'pag.inbound.queue',
  MEMORY: 'pag.memory.queue',
};

export const QUEUE_EVENTS = {
  // Inbound message processing
  MESSAGE_RECEIVED: 'message.received',
  WEBHOOK_RECEIVED: 'webhook.received',
  
  // Memory processing
  MEMORY_EXTRACT: 'memory.extract',
  MEMORY_UPDATE: 'memory.update',
};
