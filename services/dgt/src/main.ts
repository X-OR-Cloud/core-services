/**
 * DGT Service - Digital Gold Trader
 * Supports three modes:
 * - api (default): Full HTTP API server with Swagger
 * - shd: Scheduler worker - emits repeatable jobs to BullMQ
 * - ing: Data Ingestion worker - consumes jobs, fetches & saves data
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { GlobalExceptionFilter, customQueryParser } from '@hydrabyte/base';

// argv[2] takes priority (set by nx targets wrk:shd/wrk:ing), then env, then default
const MODE = process.argv[2] || process.env['MODE'] || 'api';

async function bootstrap() {
  if (MODE === 'shd' || MODE === 'ing') {
    process.env['MODE'] = MODE;
    const { bootstrapWorker } = await import('./bootstrap-worker');
    await bootstrapWorker();
  } else {
    await bootstrapApi();
  }
}

async function bootstrapApi() {
  const { AppModule } = await import('./app/app.module');
  const app = await NestFactory.create(AppModule);

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('query parser', customQueryParser);

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const config = new DocumentBuilder()
    .setTitle('DGT Service API')
    .setDescription('Digital Gold Trader Service')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT-auth')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    customSiteTitle: 'DGT Service API Documentation',
    customfavIcon: 'https://nestjs.com/img/logo-small.svg',
    customCss: '.swagger-ui .topbar { display: none }',
  });

  const port = process.env['PORT'] || 3008;
  await app.listen(port);

  Logger.log(`DGT Service is running on: http://localhost:${port}`);
  Logger.log(`API Documentation available at: http://localhost:${port}/api-docs`);
  Logger.log(`MongoDB: ${process.env['MONGODB_URI']}`);
}

bootstrap().catch((error) => {
  Logger.error('Failed to start DGT Service:', error);
  process.exit(1);
});
