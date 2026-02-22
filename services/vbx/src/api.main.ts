/**
 * VBX API Entrypoint - HTTP endpoints only
 * Usage: PORT=3370 node dist/services/vbx/api.main.js
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

  app.enableCors();
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const port = process.env['PORT'] || 3370;

  // Swagger only on first API instance
  if (String(port) === '3370') {
    const config = new DocumentBuilder()
      .setTitle('VBX Service API')
      .setDescription('Virtual Business Exchange — AI-powered virtual PBX')
      .setVersion('1.0.0')
      .addTag('extensions', 'AI Extension management')
      .addTag('calls', 'Call log and recording')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document, {
      customSiteTitle: 'VBX API Documentation',
      customCss: '.swagger-ui .topbar { display: none }',
    });
  }

  await app.listen(port);

  Logger.log(`🚀 VBX API running on: http://localhost:${port}/`);
  if (String(port) === '3370') {
    Logger.log(`📚 API Docs: http://localhost:${port}/api-docs`);
  }
}

bootstrap();
