import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { ScheduledJobModule } from '../modules/scheduled-job/scheduled-job.module';
import { JobExecutionModule } from '../modules/job-execution/job-execution.module';
import { QueueModule } from '../queues/queue.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ScheduledJobModule,
    JobExecutionModule,
    QueueModule,
  ],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
