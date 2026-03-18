import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppWorkerModule } from './app/app-worker.module';

export async function bootstrapWorker() {
  const app = await NestFactory.createApplicationContext(AppWorkerModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const shutdown = async (signal: string) => {
    Logger.log(`Received ${signal}, shutting down worker...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  Logger.log('Template Service (worker) started');
}
