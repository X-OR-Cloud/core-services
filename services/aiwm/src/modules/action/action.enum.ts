export enum ActionType {
  // Content actions
  MESSAGE = 'message',
  THINKING = 'thinking',
  TOOL_USE = 'tool_use',
  TOOL_RESULT = 'tool_result',
  ERROR = 'error',

  // Event actions
  JOINED = 'joined',
  LEFT = 'left',
  HANDOFF = 'handoff',
  NOTICE = 'notice',
}

export enum ActorRole {
  USER = 'user',
  AGENT = 'agent',
  SYSTEM = 'system',
}

export enum ActionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  ERROR = 'error',
}
