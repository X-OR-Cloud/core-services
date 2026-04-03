import { Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { redisConfig } from '../config/redis.config';

export const DGT_REDIS_CLIENT = 'DGT_REDIS_CLIENT';

export const RedisClientProvider: Provider = {
  provide: DGT_REDIS_CLIENT,
  useFactory: () => {
    return new Redis({
      ...redisConfig,
      lazyConnect: false,
    });
  },
};
