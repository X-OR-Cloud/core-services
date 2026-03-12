import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, IAM_EVENTS } from '../queue.config';
import {
  IamUserCreatedEvent,
  // IamUserUpdatedEvent,
  // IamUserDeletedEvent,
  // IamOrganizationCreatedEvent,
  // IamOrganizationUpdatedEvent,
  // IamOrganizationDeletedEvent,
} from '../queue.types';

const JOB_OPTIONS = {
  removeOnComplete: true,
  removeOnFail: 100, // keep last 100 failed jobs for debugging
} as const;

@Injectable()
export class IamEventProducer {
  private readonly logger = new Logger(IamEventProducer.name);

  constructor(
    @Optional() @InjectQueue(QUEUE_NAMES.IAM_EVENTS_NOTI) private readonly notiQueue: Queue | null,
    @Optional() @InjectQueue(QUEUE_NAMES.IAM_EVENTS_DGT) private readonly dgtQueue: Queue | null,
  ) {}

  // ---------------------------------------------------------------------------
  // User Events
  // ---------------------------------------------------------------------------

  async emitUserCreated(data: IamUserCreatedEvent['data'], correlationId?: string): Promise<void> {
    const event: IamUserCreatedEvent = {
      event: IAM_EVENTS.USER_CREATED,
      timestamp: new Date().toISOString(),
      correlationId,
      data,
    };
    await this.fanOut(IAM_EVENTS.USER_CREATED, event);
  }

  // async emitUserUpdated(data: IamUserUpdatedEvent['data'], correlationId?: string): Promise<void> {
  //   const event: IamUserUpdatedEvent = {
  //     event: IAM_EVENTS.USER_UPDATED,
  //     timestamp: new Date().toISOString(),
  //     correlationId,
  //     data,
  //   };
  //   await this.fanOut(IAM_EVENTS.USER_UPDATED, event);
  // }

  // async emitUserDeleted(data: IamUserDeletedEvent['data'], correlationId?: string): Promise<void> {
  //   const event: IamUserDeletedEvent = {
  //     event: IAM_EVENTS.USER_DELETED,
  //     timestamp: new Date().toISOString(),
  //     correlationId,
  //     data,
  //   };
  //   await this.fanOut(IAM_EVENTS.USER_DELETED, event);
  // }

  // ---------------------------------------------------------------------------
  // Organization Events (commented out — enable when consumers are ready)
  // ---------------------------------------------------------------------------

  // async emitOrganizationCreated(data: IamOrganizationCreatedEvent['data'], correlationId?: string): Promise<void> {
  //   const event: IamOrganizationCreatedEvent = {
  //     event: IAM_EVENTS.ORGANIZATION_CREATED,
  //     timestamp: new Date().toISOString(),
  //     correlationId,
  //     data,
  //   };
  //   await this.fanOut(IAM_EVENTS.ORGANIZATION_CREATED, event);
  // }

  // async emitOrganizationUpdated(data: IamOrganizationUpdatedEvent['data'], correlationId?: string): Promise<void> {
  //   const event: IamOrganizationUpdatedEvent = {
  //     event: IAM_EVENTS.ORGANIZATION_UPDATED,
  //     timestamp: new Date().toISOString(),
  //     correlationId,
  //     data,
  //   };
  //   await this.fanOut(IAM_EVENTS.ORGANIZATION_UPDATED, event);
  // }

  // async emitOrganizationDeleted(data: IamOrganizationDeletedEvent['data'], correlationId?: string): Promise<void> {
  //   const event: IamOrganizationDeletedEvent = {
  //     event: IAM_EVENTS.ORGANIZATION_DELETED,
  //     timestamp: new Date().toISOString(),
  //     correlationId,
  //     data,
  //   };
  //   await this.fanOut(IAM_EVENTS.ORGANIZATION_DELETED, event);
  // }

  // ---------------------------------------------------------------------------
  // Internal: push to all subscriber queues
  // ---------------------------------------------------------------------------

  private async fanOut(jobName: string, payload: object): Promise<void> {
    const candidates: Array<{ queue: Queue | null; name: string }> = [
      { queue: this.notiQueue, name: QUEUE_NAMES.IAM_EVENTS_NOTI },
      { queue: this.dgtQueue, name: QUEUE_NAMES.IAM_EVENTS_DGT },
    ];

    await Promise.allSettled(
      candidates
        .filter(({ queue }) => queue != null)
        .map(async ({ queue, name }) => {
          try {
            await (queue as Queue).add(jobName, payload, JOB_OPTIONS);
            this.logger.debug(`Queued [${jobName}] → ${name}`);
          } catch (err) {
            // Non-blocking: event emission failure must NOT break the main operation
            this.logger.error(`Failed to queue [${jobName}] → ${name}: ${(err as Error).message}`);
          }
        }),
    );
  }
}
