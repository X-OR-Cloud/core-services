/**
 * CBM Service - Core Business Management
 * Manages projects, works, and documents
 *
 * Modes:
 * - api (default): REST API server
 * - emb: Knowledge Base embedding worker
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { GlobalExceptionFilter, customQueryParser } from '@hydrabyte/base';

const MODE = process.env.MODE || process.argv[2] || 'api';

async function bootstrap() {
  if (MODE === 'emb') {
    const { bootstrapKbWorker } = await import('./bootstrap-kb-worker');
    await bootstrapKbWorker();
    return;
  }

  // API mode (default)
  const app = await NestFactory.create(AppModule);

  // Configure Express to use custom query parser
  // Supports: filter[search]=123, filter.search=123, filter[metadata.discordUserId]=123
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('query parser', customQueryParser);

  // Global prefix
  const globalPrefix = '';
  app.setGlobalPrefix(globalPrefix);

  // Global exception filter for standardized error responses
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Validation pipe with transformation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  const port = process.env.PORT || 3004;
  await app.listen(port);
  Logger.log(
    `🚀 CBM Service is running on: http://localhost:${port}/${globalPrefix}`
  );
}

bootstrap();
