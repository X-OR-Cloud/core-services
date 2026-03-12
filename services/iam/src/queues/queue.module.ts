import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { getBullModuleConfig, ALL_IAM_SUBSCRIBER_QUEUES } from './queue.config';
import { IamEventProducer } from './producers/iam-event.producer';

@Module({
  imports: [
    getBullModuleConfig(),
    BullModule.registerQueue(...ALL_IAM_SUBSCRIBER_QUEUES),
  ],
  providers: [IamEventProducer],
  exports: [IamEventProducer],
})
export class IamQueueModule {}
