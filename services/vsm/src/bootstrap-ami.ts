import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppAmiModule } from './app/app-ami.module';

export async function bootstrapAmi() {
  const app = await NestFactory.createApplicationContext(AppAmiModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const shutdown = async (signal: string) => {
    Logger.log(`Received ${signal}, shutting down AMI bridge...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  Logger.log('VSM Service (ami bridge) started');
}
