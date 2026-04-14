export const redisConfig = {
  host: process.env['REDIS_HOST'] || 'localhost',
  port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
  username: process.env['REDIS_USERNAME'] || undefined,
  password: process.env['REDIS_PASSWORD'] || undefined,
  db: parseInt(process.env['REDIS_DB'] || '0', 10),
  enableReadyCheck: false,
};

/** Pub/sub channel broadcast when an instruction is updated in DB. */
export const REDIS_CHANNEL_INSTRUCTION_UPDATED = 'aiwm:instruction-updated';

export interface InstructionUpdatedEvent {
  instructionId: string;
  updatedAt: string;
}
