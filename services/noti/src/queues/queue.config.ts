import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

/**
 * Queue Names
 */
export const QUEUE_NAMES = {
  NOTI: 'noti',
} as const;

/**
 * BullMQ Queue Configuration
 * Provides Redis connection config for all queues
 */
export const getBullModuleConfig = (configService: ConfigService) => {
  return BullModule.forRoot({
    connection: {
      host: configService.get<string>('REDIS_HOST', 'localhost'),
      port: configService.get<number>('REDIS_PORT', 6379),
      username: configService.get<string>('REDIS_USERNAME') || undefined,
      password: configService.get<string>('REDIS_PASSWORD') || undefined,
      db: configService.get<number>('REDIS_DB', 0),
    },
  });
};

/**
 * Register 'noti' queue
 */
export const registerNotiQueue = () => {
  return BullModule.registerQueue({
    name: QUEUE_NAMES.NOTI,
  });
};
