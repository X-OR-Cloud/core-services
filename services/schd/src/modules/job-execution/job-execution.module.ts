import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobExecution, JobExecutionSchema } from './job-execution.schema';
import { JobExecutionService } from './job-execution.service';
import { JobExecutionController, JobExecutionsController } from './job-execution.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: JobExecution.name, schema: JobExecutionSchema },
    ]),
  ],
  controllers: [JobExecutionController, JobExecutionsController],
  providers: [JobExecutionService],
  exports: [JobExecutionService],
})
export class JobExecutionModule {}
