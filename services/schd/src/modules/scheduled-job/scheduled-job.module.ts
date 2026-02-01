import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduledJob, ScheduledJobSchema } from './scheduled-job.schema';
import { ScheduledJobService } from './scheduled-job.service';
import { ScheduledJobController } from './scheduled-job.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScheduledJob.name, schema: ScheduledJobSchema },
    ]),
  ],
  controllers: [ScheduledJobController],
  providers: [ScheduledJobService],
  exports: [ScheduledJobService],
})
export class ScheduledJobModule {}
