import { BullModule } from '@nestjs/bullmq';

export const QUEUE_NAMES = {
  IAM_EVENTS_NOTI: 'iam.events.noti',
  IAM_EVENTS_DGT: 'iam.events.dgt',
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
  { name: QUEUE_NAMES.IAM_EVENTS_DGT },
];

export const getBullModuleConfig = () =>
  BullModule.forRoot({
    connection: {
      host: process.env['REDIS_HOST'] || 'localhost',
      port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
      password: process.env['REDIS_PASSWORD'] || undefined,
      db: parseInt(process.env['REDIS_DB'] || '0', 10),
    },
  });
