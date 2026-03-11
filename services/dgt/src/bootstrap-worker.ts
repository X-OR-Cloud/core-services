import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';

/**
 * Bootstrap Worker Mode
 * - No HTTP server
 * - Scheduler (shd): emits repeatable jobs to BullMQ
 * - Data Ingestion (ing): consumes jobs, fetches data, saves to MongoDB
 * - Signal Generation (sig): AI signal generation worker
 * - Monitor (mon): Monitoring worker
 */
export async function bootstrapWorker() {
  const mode = process.env.MODE || 'shd';
  const logger = new Logger('WorkerBootstrap');

  logger.log(`Starting DGT Worker (mode: ${mode})...`);

  let moduleClass: any;
  if (mode === 'shd') {
    const { AppSchedulerModule } = await import('./app/app-scheduler.module');
    moduleClass = AppSchedulerModule;
  } else if (mode === 'ing') {
    const { AppIngestionModule } = await import('./app/app-ingestion.module');
    moduleClass = AppIngestionModule;
  } else if (mode === 'sig') {
    const { AppSignalModule } = await import('./app/app-signal.module');
    moduleClass = AppSignalModule;
  } else if (mode === 'mon') {
    const { AppMonitorModule } = await import('./app/app-monitor.module');
    moduleClass = AppMonitorModule;
  } else {
    // fallback
    const { AppWorkerModule } = await import('./app/app-worker.module');
    moduleClass = AppWorkerModule;
  }

  const app = await NestFactory.createApplicationContext(moduleClass, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  app.enableShutdownHooks();

  const redisHost = process.env['REDIS_HOST'] || 'localhost';
  const redisPort = process.env['REDIS_PORT'] || '6379';

  logger.log('Worker Configuration:');
  logger.log(`  - Mode: ${mode}`);
  logger.log(`  - Redis: ${redisHost}:${redisPort}`);
  logger.log(`  - MongoDB: ${process.env['MONGODB_URI']}`);
  logger.log(`DGT Worker (${mode}) started successfully`);

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
