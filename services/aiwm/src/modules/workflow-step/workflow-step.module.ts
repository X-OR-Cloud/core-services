import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkflowStepController } from './workflow-step.controller';
import { WorkflowStepService } from './workflow-step.service';
import { WorkflowStep, WorkflowStepSchema } from './workflow-step.schema';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: WorkflowStep.name, schema: WorkflowStepSchema }]),
    WorkflowModule, // Import WorkflowModule to access WorkflowService
  ],
  controllers: [WorkflowStepController],
  providers: [WorkflowStepService],
  exports: [WorkflowStepService, MongooseModule],
})
export class WorkflowStepModule {}
