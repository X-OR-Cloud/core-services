import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from '@nestjs-modules/ioredis';
import { PresenceService } from './presence.service';

@Module({
  imports: [
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const url =
          configService.get<string>('REDIS_URL') ||
          (() => {
            const host = configService.get<string>('REDIS_HOST') || 'localhost';
            const port = configService.get<string>('REDIS_PORT') || '6379';
            const user = configService.get<string>('REDIS_USERNAME') || '';
            const pass = configService.get<string>('REDIS_PASSWORD') || '';
            return pass
              ? `redis://${user}:${encodeURIComponent(pass)}@${host}:${port}`
              : `redis://${host}:${port}`;
          })();
        return {
          type: 'single' as const,
          url,
          options: {
            enableReadyCheck: false,
            retryStrategy: (times: number) => Math.min(times * 50, 2000),
            maxRetriesPerRequest: 3,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
