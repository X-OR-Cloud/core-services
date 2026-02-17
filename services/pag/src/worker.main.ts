/**
 * PAG Worker Entrypoint - Queue processors only
 * No HTTP server — processes BullMQ jobs (inbound, memory, heartbeat, token-refresh)
 *
 * Usage: WORKER_ID=1 node dist/services/pag/worker.main.js
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './app/worker.module';

async function bootstrap() {
  const app = await NestFactory.create(WorkerModule, {
    // No HTTP listener needed for worker
  });

  // Initialize the app (starts processors) but don't listen on a port
  await app.init();

  const workerId = process.env['WORKER_ID'] || '0';
  Logger.log(`🔧 PAG Worker #${workerId} started — listening to queues`);
  Logger.log(`📊 Redis: ${process.env['REDIS_HOST']}:${process.env['REDIS_PORT']}`);
}

bootstrap();
