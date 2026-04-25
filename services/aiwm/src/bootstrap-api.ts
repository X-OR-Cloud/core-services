/**
 * API Server Bootstrap
 * REST API only — WebSocket is handled by dedicated CWS/AWS/NWS processes
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { GlobalExceptionFilter, customQueryParser } from '@hydrabyte/base';
import { AppModule } from './app/app.module';
import * as bodyParser from 'body-parser';

export async function bootstrapApiServer() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('query parser', customQueryParser);

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
  }));

  const config = new DocumentBuilder()
    .setTitle('AIWM Service API')
    .setDescription('AI Workflow Management - GPU Nodes, Model Deployment, and Agent Framework')
    .setVersion('1.0.0')
    .addTag('nodes', 'GPU Node management endpoints')
    .addTag('models', 'Model registry endpoints')
    .addTag('deployments', 'Model deployment endpoints')
    .addTag('agents', 'AI Agent management endpoints')
    .addTag('tools', 'MCP Tool registry endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    customSiteTitle: 'AIWM Service API Documentation',
    customfavIcon: 'https://nestjs.com/img/logo-small.svg',
    customCss: '.swagger-ui .topbar { display: none }',
  });

  const port = process.env.PORT || 3003;
  await app.listen(port);

  Logger.log(`🚀 AIWM Service is running on: http://localhost:${port}`);
  Logger.log(`📚 API Documentation available at: http://localhost:${port}/api-docs`);
  const mongoUri = process.env.MONGODB_URI || '';
  Logger.log(`💾 MongoDB: ${mongoUri.replace(/:\/\/[^@]+@/, '://***@')}`);
}
