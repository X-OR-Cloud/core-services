import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * RedisIoAdapter - Socket.IO adapter with Redis for horizontal scaling
 *
 * This adapter allows multiple server instances to share WebSocket connections
 * and broadcast events across all instances using Redis Pub/Sub.
 *
 * Usage:
 * In main.ts:
 * const app = await NestFactory.create(AppModule);
 * const redisIoAdapter = new RedisIoAdapter(app);
 * await redisIoAdapter.connectToRedis();
 * app.useWebSocketAdapter(redisIoAdapter);
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);
  private readonly app: INestApplicationContext;

  constructor(app: INestApplicationContext) {
    super(app);
    this.app = app;
  }

  async connectToRedis(): Promise<void> {
    // Resolve from ConfigService (loaded from .env by ConfigModule) first,
    // fall back to process.env for cases where pm2 inherited the shell env.
    // pm2 `env_file` does NOT populate process.env in the running process,
    // so reading process.env directly would fall through to localhost and ECONNREFUSED.
    let redisUrl = 'redis://localhost:6379';
    try {
      const configService = this.app.get(ConfigService);
      redisUrl = configService.get<string>('REDIS_URL') || process.env.REDIS_URL || redisUrl;
    } catch {
      redisUrl = process.env.REDIS_URL || redisUrl;
    }

    const redisDisplay = redisUrl.replace(/:\/\/[^@]+@/, '://***@');
    this.logger.log(`[REDIS-ADAPTER] Connecting to Redis: ${redisDisplay}`);

    try {
      // Create Redis clients for pub/sub
      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();

      await Promise.all([pubClient.connect(), subClient.connect()]);

      this.adapterConstructor = createAdapter(pubClient, subClient);

      this.logger.log('[REDIS-ADAPTER] ✅ Redis adapter connected successfully');
      this.logger.log('[REDIS-ADAPTER] WebSocket events will be synced across all instances');
    } catch (error) {
      this.logger.error(`[REDIS-ADAPTER] ❌ Failed to connect: ${error.message}`);
      this.logger.warn('[REDIS-ADAPTER] ⚠️  Falling back to in-memory adapter (single instance only)');
      this.logger.warn('[REDIS-ADAPTER] ⚠️  WebSocket will NOT work properly with load balancer!');
      // Adapter will fall back to default in-memory adapter
    }
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);

    // Apply Redis adapter if connected
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
      this.logger.log('[REDIS-ADAPTER] ✅ Socket.IO using Redis adapter for horizontal scaling');
    } else {
      this.logger.warn('[REDIS-ADAPTER] ⚠️  Socket.IO using default in-memory adapter (single instance only)');
    }

    return server;
  }
}
