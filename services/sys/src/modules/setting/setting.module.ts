import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { RedisModule } from '@nestjs-modules/ioredis';
import { Setting, SettingSchema } from './setting.schema';
import { SettingService } from './setting.service';
import { SettingController } from './setting.controller';
import { SettingPublisherService } from './setting-publisher.service';

/**
 * Setting Module — UI CRUD + pub/sub publisher.
 *
 * Internal endpoints (CIDR + APIKey + RateLimit guards) and the metadata
 * endpoint live in `SettingController` (public for metadata via no-auth routes).
 *
 * Ref: docs/sys/PLAN_v1.md Phase P1
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Setting.name, schema: SettingSchema }]),
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
  controllers: [SettingController],
  providers: [SettingService, SettingPublisherService],
  exports: [SettingService, SettingPublisherService],
})
export class SettingModule {}
