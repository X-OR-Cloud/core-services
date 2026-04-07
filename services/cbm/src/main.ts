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
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import { GlobalExceptionFilter, customQueryParser } from '@hydrabyte/base';
import { OpenApiStore } from './skill/openapi.store';

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

  // Swagger / OpenAPI setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CBM Service API')
    .setDescription('Core Business Management — Projects, Work, CRM, Finance')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT-auth')
    .addTag('Projects', 'Project management with state machine and member RBAC')
    .addTag('Works', 'Work items (epic/task/subtask) with state machine')
    .addTag('Documents', 'Text documents with sharing links')
    .addTag('Companies', 'Company/vendor/partner CRM records')
    .addTag('Contacts', 'Contact persons linked to companies')
    .addTag('Interactions', 'Interaction log (calls, emails, meetings)')
    .addTag('Invoices', 'Sales invoices with state machine')
    .addTag('Expenses', 'Internal expenses with approval workflow')
    .addTag('Payments', 'Invoice payments (immutable after creation)')
    .addTag('Transactions', 'Read-only financial transaction ledger')
    .addTag('Knowledge Collections', 'RAG knowledge base collections')
    .addTag('Knowledge Files', 'File upload and indexing pipeline')
    .addTag('Skill', 'Agent skill manifest endpoint')
    .build();

  const openApiDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, openApiDocument, {
    customSiteTitle: 'CBM Service API',
    customCss: '.swagger-ui .topbar { display: none }',
  });

  // Inject OpenAPI document into SkillModule's OpenApiStore for dynamic skill generation
  const openApiStore = app.get(OpenApiStore);
  openApiStore.setDocument(openApiDocument);

  const port = process.env.PORT || 3004;
  await app.listen(port);
  Logger.log(
    `🚀 CBM Service is running on: http://localhost:${port}/${globalPrefix}`
  );
  Logger.log(`📚 API Docs: http://localhost:${port}/api-docs`);
}

bootstrap();
