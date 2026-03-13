/**
 * Entry point for the Knowledge Base indexing worker
 * Run: nx run cbm:kb-wrk
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { KbWorkerModule } from './kb-worker.module';

export async function bootstrapKbWorker() {
  const app = await NestFactory.createApplicationContext(KbWorkerModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });

  Logger.log('🔄 CBM Knowledge Worker is running...', 'KbWorker');

  // Keep alive — the KnowledgeWorkerService polls internally
  process.on('SIGTERM', async () => {
    Logger.log('SIGTERM received, shutting down KB Worker...', 'KbWorker');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    Logger.log('SIGINT received, shutting down KB Worker...', 'KbWorker');
    await app.close();
    process.exit(0);
  });
}

// Only auto-run when executed directly (kb-worker.js entry point)
if (require.main === module) {
  bootstrapKbWorker().catch((err) => {
    Logger.error(`KB Worker failed to start: ${err.message}`, err.stack, 'KbWorker');
    process.exit(1);
  });
}
