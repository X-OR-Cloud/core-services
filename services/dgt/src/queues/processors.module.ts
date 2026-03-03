import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../config/queue.config';
import { SchedulerProcessor } from './scheduler.processor';
import { DataIngestionProcessor } from './data-ingestion.processor';
import { CollectorsModule } from '../collectors/collectors.module';
import { IndicatorsModule } from '../indicators/indicators.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.SCHEDULER },
      { name: QUEUE_NAMES.DATA_INGESTION },
    ),
    CollectorsModule,
    IndicatorsModule,
  ],
  providers: [
    SchedulerProcessor,
    DataIngestionProcessor,
  ],
  exports: [
    SchedulerProcessor,
    DataIngestionProcessor,
  ],
})
export class ProcessorsModule {}
