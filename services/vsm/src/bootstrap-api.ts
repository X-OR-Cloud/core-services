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
    .setTitle('VSM — Voice Service Management API')
    .setDescription('Control plane cho hệ thống telephony dựa trên Asterisk PBX')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('nodes', 'Asterisk node management')
    .addTag('accounts', 'SIP/WebRTC account management')
    .addTag('trunks', 'SIP trunk management')
    .addTag('phone-numbers', 'DID phone number management')
    .addTag('routes', 'Call routing rules')
    .addTag('dialplans', 'Asterisk dialplan management')
    .addTag('calls', 'Call records & origination')
    .addTag('webhooks', 'Internal AMI bridge webhooks')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    customSiteTitle: 'VSM API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
  });

  const port = process.env['PORT'] || 3009;
  await app.listen(port);

  Logger.log(`VSM Service (api) running on: http://localhost:${port}`);
  Logger.log(`API Documentation: http://localhost:${port}/api-docs`);
}
