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
    .setTitle('SYS Service API')
    .setDescription('System utilities — runtime settings management and centralized audit-log')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('settings', 'Setting management endpoints (CRUD + internal consumption)')
    .addTag('audit-logs', 'Audit-log query and ingest endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    customSiteTitle: 'SYS Service API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
  });

  const port = process.env['PORT'] || 3007;
  await app.listen(port);

  Logger.log(`SYS Service (api) running on: http://localhost:${port}`);
  Logger.log(`API Documentation: http://localhost:${port}/api-docs`);
}
