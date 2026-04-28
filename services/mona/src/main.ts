import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { GlobalExceptionFilter, customQueryParser } from '@hydrabyte/base';
import { AppModule } from './app/app.module';

const MODE = process.env['MODE'] || process.argv[2] || 'api';

async function bootstrap() {
  if (MODE === 'agg') {
    const { bootstrapAggWorker } = await import('./bootstrap-agg');
    await bootstrapAggWorker();
  } else {
    await bootstrapApi();
  }
}

async function bootstrapApi() {
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
    .setTitle('Mona Service API')
    .setDescription('Microservices Mona - Category, Product CRUD with Event-Driven Report Generation')
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

  const port = process.env['PORT'] || 3005;
  await app.listen(port);

  Logger.log(`🚀 MONA Service is running on: http://localhost:${port}`);
  Logger.log(`📚 API Documentation available at: http://localhost:${port}/api-docs`);
  Logger.log(`📊 Redis: ${process.env.REDIS_URL || 'redis://localhost:6379'}`);
  Logger.log(`💾 MongoDB: ${process.env['MONGODB_URI']}`);
}

bootstrap().catch((error) => {
  Logger.error('Failed to start MONA service', error);
  process.exit(1);
});
