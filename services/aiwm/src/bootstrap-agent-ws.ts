import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { GlobalExceptionFilter } from '@hydrabyte/base';
import { AgentWsAppModule } from './agent-ws.app.module';
import { RedisIoAdapter } from './modules/chat/redis-io.adapter';

export async function bootstrapAgentWsServer() {
  const app = await NestFactory.create<NestExpressApplication>(AgentWsAppModule);

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

  const port = process.env.PORT_AWS || process.env.PORT || 3400;
  await app.listen(port);

  Logger.log(`🚀 AIWM Agent WS Server is running on: http://localhost:${port}`);
  Logger.log(`🤖 Agent WebSocket Gateway: ws://localhost:${port}/ws/agent`);
  Logger.log(`📊 Redis: ${process.env.REDIS_URL || 'redis://localhost:6379'}`);
}
