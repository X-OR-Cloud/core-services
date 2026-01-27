/**
 * Template Service - Microservices Pattern Example
 * Demonstrates CRUD, Event-Driven Architecture with BullMQ, and Report Generation
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { GlobalExceptionFilter, customQueryParser } from '@hydrabyte/base';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configure Express to use custom query parser
  // Supports: filter[search]=123, filter.search=123, filter[metadata.discordUserId]=123
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('query parser', customQueryParser);

  // Global prefix
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Global exception filter for standardized error responses
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Template Service API')
    .setDescription('Microservices Template - Category, Product CRUD with Event-Driven Report Generation')
    .setVersion('1.0.0')
    .addTag('categories', 'Category management endpoints')
    .addTag('products', 'Product management endpoints')
    .addTag('reports', 'Report generation endpoints (Event-Driven with BullMQ)')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    customSiteTitle: 'Template Service API Documentation',
    customfavIcon: 'https://nestjs.com/img/logo-small.svg',
    customCss: '.swagger-ui .topbar { display: none }',
  });

  const port = process.env['PORT'] || 3002;
  await app.listen(port);

  Logger.log(`🚀 Template Service is running on: http://localhost:${port}/${globalPrefix}`);
  Logger.log(`📚 API Documentation available at: http://localhost:${port}/api-docs`);
  Logger.log(`📊 Redis: ${process.env['REDIS_HOST']}:${process.env['REDIS_PORT']}`);
  Logger.log(`💾 MongoDB: ${process.env['MONGODB_URI']}`);
}

bootstrap();
