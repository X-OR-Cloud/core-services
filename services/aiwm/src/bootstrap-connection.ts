import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConnectionWorkerModule } from './connection-worker.module';

/**
 * Bootstrap Connection Worker Mode (con)
 * - No HTTP server
 * - Loads active connections from DB and spawns ConnectionRunners
 * - Each runner bridges Discord/Telegram messages into AIWM pipeline
 */
export async function bootstrapConnectionWorker() {
  process.env.MODE = 'con';

  const logger = new Logger('ConnectionWorkerBootstrap');

  logger.log('Starting AIWM Connection Worker...');

  const app = await NestFactory.createApplicationContext(ConnectionWorkerModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  app.enableShutdownHooks();

  logger.log('Connection Worker Configuration:');
  logger.log(`  - MongoDB: ${process.env.MONGODB_URI?.indexOf('@') > 0 ? process.env.MONGODB_URI?.split('@')[1] : process.env.MONGODB_URI}`);
  logger.log('Connection Worker started successfully');

  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received, shutting down connection worker gracefully...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received, shutting down connection worker gracefully...');
    await app.close();
    process.exit(0);
  });

  return app;
}
