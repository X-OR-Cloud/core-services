import { Module } from '@nestjs/common';
import { JobResultProcessor } from './processors/job-result.processor';
import { JobExecutionModule } from '../modules/job-execution/job-execution.module';
import { ScheduledJobModule } from '../modules/scheduled-job/scheduled-job.module';

@Module({
  imports: [
    JobExecutionModule,
    ScheduledJobModule,
  ],
  providers: [
    JobResultProcessor,
  ],
})
export class ProcessorsModule {}
