import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { GlobalExceptionFilter, customQueryParser } from '@hydrabyte/base';
import { AppModule } from './app/app.module';

export async function bootstrapApi() {
  const app = await NestFactory.create(AppModule);

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('query parser', customQueryParser);

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('Template Service API')
    .setDescription('Microservices Template - Category, Product CRUD with Event-Driven Report Generation')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('categories', 'Category management endpoints')
    .addTag('products', 'Product management endpoints')
    .addTag('reports', 'Report generation endpoints (Event-Driven with BullMQ)')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    customSiteTitle: 'Template Service API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
  });

  const port = process.env['PORT'] || 3000;
  await app.listen(port);

  Logger.log(`Template Service (api) running on: http://localhost:${port}`);
  Logger.log(`API Documentation: http://localhost:${port}/api-docs`);
}
