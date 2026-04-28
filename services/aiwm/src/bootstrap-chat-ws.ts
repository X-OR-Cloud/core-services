import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { GlobalExceptionFilter } from '@hydrabyte/base';
import { ChatGatewayModule } from './modules/chat-gateway/chat-gateway.module';
import { RedisIoAdapter } from './modules/chat/redis-io.adapter';

export async function bootstrapChatWsServer() {
  const app = await NestFactory.create<NestExpressApplication>(ChatGatewayModule);

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  const port = process.env.PORT_CWS || process.env.PORT || 3407;
  await app.listen(port);

  Logger.log(`🚀 AIWM Chat WS Server is running on: http://localhost:${port}`);
  Logger.log(`💬 Chat WebSocket Gateway: ws://localhost:${port}/`);
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisDisplay = redisUrl.replace(/:\/\/[^@]+@/, '://***@');
  Logger.log(`📊 Redis: ${redisDisplay}`);
}
