import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../config/queue.config';
import { AmiCommandsProducer } from './producers/ami-commands.producer';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.AMI_COMMANDS }),
  ],
  providers: [AmiCommandsProducer],
  exports: [AmiCommandsProducer],
})
export class QueueModule {}
