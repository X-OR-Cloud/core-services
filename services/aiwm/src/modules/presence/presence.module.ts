import { Module } from '@nestjs/common';
import { RedisModule } from '@nestjs-modules/ioredis';
import { PresenceService } from './presence.service';
import { ConfigModule } from '@nestjs/config';

function buildRedisUrl(): string {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const host = process.env.REDIS_HOST || 'localhost';
  const port = process.env.REDIS_PORT || '6379';
  const user = process.env.REDIS_USERNAME || '';
  const pass = process.env.REDIS_PASSWORD || '';
  return pass
    ? `redis://${user}:${encodeURIComponent(pass)}@${host}:${port}`
    : `redis://${host}:${port}`;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule.forRoot({
      type: 'single',
      url: buildRedisUrl(),
      options: {
        enableReadyCheck: false,
        retryStrategy: (times: number) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3,
      },
    }),
  ],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
