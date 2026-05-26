import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { GlobalExceptionFilter } from '@hydrabyte/base';
import { VoiceGatewayModule } from './modules/voice-gateway/voice-gateway.module';
import { RedisIoAdapter } from './modules/chat/redis-io.adapter';

export async function bootstrapVoiceWsServer() {
  const app = await NestFactory.create<NestExpressApplication>(VoiceGatewayModule);

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }),
  );

  const port = process.env.PORT_VWS || process.env.PORT || 3410;
  await app.listen(port);

  Logger.log(`🚀 AIWM Voice WS Server is running on: http://localhost:${port}`);
  Logger.log(`🎙️  Voice WebSocket Gateway: ws://localhost:${port}/`);
}
