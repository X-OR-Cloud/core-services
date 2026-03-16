import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../config/queue.config';
import { AccountModule } from '../modules/account/account.module';
import { IamEventProcessor } from './iam-event.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.IAM_EVENTS }),
    AccountModule,
  ],
  providers: [IamEventProcessor],
})
export class IamEventsModule {}
