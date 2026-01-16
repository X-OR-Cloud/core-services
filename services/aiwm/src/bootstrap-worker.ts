import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

/**
 * Bootstrap Worker Mode
 * - No HTTP server
 * - Only BullMQ workers for processing queue jobs
 * - Connects to MongoDB and Redis
 */
export async function bootstrapWorker() {
  // Set MODE environment variable for ExecutionModule
  process.env.MODE = 'worker';

  const logger = new Logger('WorkerBootstrap');

  logger.log('Starting AIWM Worker...');

  // Create application context without HTTP listener
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // Enable graceful shutdown
  app.enableShutdownHooks();

  // Log worker configuration
  const concurrency = process.env.WORKER_CONCURRENCY || '5';
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = process.env.REDIS_PORT || '6379';

  logger.log('Worker Configuration:');
  logger.log(`  - Mode: ${process.env.MODE}`);
  logger.log(`  - Concurrency: ${concurrency}`);
  logger.log(`  - Redis: ${redisHost}:${redisPort}`);
  logger.log(`  - MongoDB: ${process.env.MONGODB_URI.indexOf('@') > 0 ? process.env.MONGODB_URI?.split('@')[1] || 'localhost' : process.env.MONGODB_URI}`);

  logger.log('✅ AIWM Worker started successfully');
  logger.log('Listening for jobs from BullMQ queue...');

  // Handle process termination
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received, shutting down worker gracefully...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received, shutting down worker gracefully...');
    await app.close();
    process.exit(0);
  });

  return app;
}
