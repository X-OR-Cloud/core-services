/**
 * PAG API Entrypoint - HTTP endpoints only
 * No queue processors — use worker.main.ts for that
 *
 * Usage: PORT=3360 node dist/services/pag/api.main.js
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { GlobalExceptionFilter, customQueryParser } from '@hydrabyte/base';
import { ApiModule } from './app/api.module';

async function bootstrap() {
  const app = await NestFactory.create(ApiModule);

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('query parser', customQueryParser);

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Swagger (only on first API instance to avoid confusion)
  const port = process.env['PORT'] || 3360;
  if (String(port) === '3360') {
    const config = new DocumentBuilder()
      .setTitle('PAG Service API')
      .setDescription('Personal Agent Gateway - Channels, Souls, Conversations, Messages, and Memories')
      .setVersion('1.0.0')
      .addTag('channels', 'Platform connection management (Zalo OA, Telegram, etc.)')
      .addTag('souls', 'AI personality and configuration management')
      .addTag('conversations', 'Chat session management')
      .addTag('messages', 'Message history management')
      .addTag('memories', 'Long-term memory management')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document, {
      customSiteTitle: 'PAG Service API Documentation',
      customfavIcon: 'https://nestjs.com/img/logo-small.svg',
      customCss: '.swagger-ui .topbar { display: none }',
    });
  }

  await app.listen(port);

  Logger.log(`🚀 PAG API is running on: http://localhost:${port}/`);
  if (String(port) === '3360') {
    Logger.log(`📚 API Documentation available at: http://localhost:${port}/api-docs`);
  }
}

bootstrap();
