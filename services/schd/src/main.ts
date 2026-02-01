/**
 * SCHD Service - Scheduler Service
 * Job Scheduling & Orchestration Service
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { GlobalExceptionFilter, customQueryParser } from '@hydrabyte/base';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configure Express to use custom query parser
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
    .setTitle('SCHD - Scheduler Service API')
    .setDescription('Job Scheduling & Orchestration Service - Quản lý và thực thi các tác vụ tự động theo lịch')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT-auth',
    )
    .addTag('jobs', 'Scheduled Job management endpoints')
    .addTag('executions', 'Job Execution history endpoints')
    .addTag('health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    customSiteTitle: 'SCHD - Scheduler Service API',
    customfavIcon: 'https://nestjs.com/img/logo-small.svg',
    customCss: '.swagger-ui .topbar { display: none }',
  });

  const port = process.env['PORT'] || 3006;
  await app.listen(port);

  Logger.log(`🚀 SCHD Service is running on: http://localhost:${port}/${globalPrefix}`);
  Logger.log(`📚 API Documentation available at: http://localhost:${port}/api-docs`);
  Logger.log(`📊 Redis: ${process.env['REDIS_HOST']}:${process.env['REDIS_PORT']}`);
  Logger.log(`💾 MongoDB: ${process.env['MONGODB_URI']}`);
}

bootstrap();
