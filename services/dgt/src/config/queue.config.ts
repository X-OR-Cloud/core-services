export const QUEUE_NAMES = {
  SCHEDULER: 'dgt-scheduler',
  DATA_INGESTION: 'dgt-data-ingestion',
  SIGNAL_SCHEDULER: 'dgt-signal-scheduler',
  SIGNAL_GENERATION: 'dgt-signal-generation',
  IAM_EVENTS: 'iam.events.dgt',
};

export const SIGNAL_JOB_TYPES = {
  GENERATE_SIGNAL: 'generate_signal',
  EXPIRE_SIGNALS: 'expire_signals',
  SYNC_ACCOUNT_SIGNALS: 'sync_account_signals',
};

export const INGESTION_JOB_TYPES = {
  SYNC_ACCOUNT_BALANCES: 'sync_account_balances',
};
