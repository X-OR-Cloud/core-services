import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { Workflow, WorkflowSchema } from './workflow.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Workflow.name, schema: WorkflowSchema }]),
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService, MongooseModule],
})
export class WorkflowModule {}
