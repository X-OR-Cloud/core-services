import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppAggModule } from './app/app-agg.module';

export async function bootstrapAggWorker() {
  const logger = new Logger('AggBootstrap');
  logger.log('Starting MONA Aggregation Worker...');

  const app = await NestFactory.createApplicationContext(AppAggModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  app.enableShutdownHooks();

  const redisHost = process.env['REDIS_HOST'] || 'localhost';
  const redisPort = process.env['REDIS_PORT'] || '6379';
  logger.log(`  Redis: ${redisHost}:${redisPort}`);
  logger.log(`  MongoDB: ${process.env['MONGODB_URI']}`);
  logger.log(`  Concurrency: ${process.env['WORKER_CONCURRENCY'] || '3'}`);
  logger.log('MONA Aggregation Worker started');

  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });
}
