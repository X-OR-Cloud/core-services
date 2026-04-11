import { config as dotenvConfig } from 'dotenv';

// Load .env early so process.env is populated before module-level constants
// are evaluated. This is needed when pm2 env_file fails to load (e.g. when
// pm2 is started from a subprocess without inheriting the env file).
dotenvConfig();

export const redisConfig = {
  host: process.env['REDIS_HOST'] || 'localhost',
  port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
  username: process.env['REDIS_USERNAME'] || undefined,
  password: process.env['REDIS_PASSWORD'] || undefined,
  db: parseInt(process.env['REDIS_DB'] || '0', 10),
  enableReadyCheck: false,
};
