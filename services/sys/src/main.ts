// Load .env BEFORE any module imports so process.env is populated
// when module-level code (e.g. redisConfig) is evaluated
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const MODE = process.argv[2] || process.env['MODE'] || 'api';

async function main() {
  if (MODE === 'wrk') {
    const { bootstrapWorker } = await import('./bootstrap-worker');
    await bootstrapWorker();
  } else {
    const { bootstrapApi } = await import('./bootstrap-api');
    await bootstrapApi();
  }
}

main();
