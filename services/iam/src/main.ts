/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { GlobalExceptionFilter, customQueryParser } from '@hydrabyte/base';
import { SERVICE_CONFIG } from '@hydrabyte/shared';
import { AppModule } from './app.module';
import { validateEnvironment } from './core/utils/env-validator.util';

async function bootstrap() {

  // initialize SERVICE_CONFIG from environment variables
  SERVICE_CONFIG.iam.mongodbUri = `${process.env.MONGODB_URI}/${SERVICE_CONFIG.iam.name}`;

  const app = await NestFactory.create(AppModule);

  // Configure Express to use custom query parser
  // Supports: filter[search]=123, filter.search=123, filter[metadata.discordUserId]=123
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('query parser', customQueryParser);

  // Global exception filter for standardized error responses
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Setup global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true
    })
  );

  // Swagger/OpenAPI Configuration
  const config = new DocumentBuilder()
    .setTitle('IAM Service API')
    .setDescription('Identity & Access Management Service')
    .setVersion('1.0.0')
    .addTag('auth', 'Authentication & Authorization endpoints')
    .addTag('users', 'User management endpoints')
    .addTag('organizations', 'Organization management endpoints')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth'
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    customSiteTitle: 'IAM API Documentation',
    customfavIcon: 'https://nestjs.com/img/logo-small.svg',
    customCss: '.swagger-ui .topbar { display: none }',
  });

  const globalPrefix = '';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`
  );
  Logger.log(
    `📚 API Documentation available at: http://localhost:${port}/api-docs`
  );
}

// Validate environment variables before starting
validateEnvironment();
bootstrap();
