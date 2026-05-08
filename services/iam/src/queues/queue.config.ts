import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const QUEUE_NAMES = {
  IAM_EVENTS_NOTI: 'iam.events.noti',
} as const;

export type IamQueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const IAM_EVENTS = {
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  ORGANIZATION_CREATED: 'organization.created',
  ORGANIZATION_UPDATED: 'organization.updated',
  ORGANIZATION_DELETED: 'organization.deleted',
} as const;

export type IamEvent = (typeof IAM_EVENTS)[keyof typeof IAM_EVENTS];

/**
 * All subscriber queues — add new service queues here when a new consumer onboards.
 * Each entry is an independent queue; a service with no processor simply won't consume it.
 */
export const ALL_IAM_SUBSCRIBER_QUEUES = [
  { name: QUEUE_NAMES.IAM_EVENTS_NOTI },
];

export const getBullModuleConfig = () =>
  BullModule.forRootAsync({
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      connection: {
        host: config.get('REDIS_HOST') || 'localhost',
        port: parseInt(config.get('REDIS_PORT') || '6379', 10),
        username: config.get('REDIS_USERNAME') || undefined,
        password: config.get('REDIS_PASSWORD') || undefined,
        db: parseInt(config.get('REDIS_DB') || '0', 10),
      },
    }),
  });
