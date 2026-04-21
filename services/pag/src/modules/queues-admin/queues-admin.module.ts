import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../../config/queue.config';
import { QueuesAdminService } from './queues-admin.service';
import { QueuesAdminController } from './queues-admin.controller';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.INBOUND },
      { name: QUEUE_NAMES.HEARTBEAT },
      { name: QUEUE_NAMES.MEMORY_EXTRACT },
      { name: QUEUE_NAMES.TOKEN_REFRESH },
      { name: QUEUE_NAMES.TASKS },
    ),
  ],
  providers: [QueuesAdminService],
  controllers: [QueuesAdminController],
})
export class QueuesAdminModule {}
