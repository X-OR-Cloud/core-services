import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { Execution, ExecutionSchema } from './execution.schema';
import { ExecutionService } from './execution.service';
import { ExecutionController } from './execution.controller';
import { ExecutionOrchestrator } from './execution.orchestrator';
import { ExecutionTimeoutMonitor } from './execution-timeout.monitor';
import { NodeModule } from '../node/node.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { WorkflowStepModule } from '../workflow-step/workflow-step.module';
import { ExecutionOrchestratorService } from './services/execution-orchestrator.service';
import { WorkflowExecutionQueue } from './queues/workflow-execution.queue';
import { WorkflowExecutionWorker } from './queues/workflow-execution.worker';

/**
 * ExecutionModule - Workflow orchestration module
 *
 * Provides:
 * - Execution entity (multi-step workflow tracking)
 * - ExecutionService (CRUD operations)
 * - ExecutionOrchestrator (deployment workflow management)
 * - ExecutionOrchestratorService (workflow template execution) - NEW
 * - ExecutionController (REST API)
 * - ExecutionTimeoutMonitor (timeout handling)
 * - WorkflowExecutionQueue (BullMQ producer) - NEW
 * - WorkflowExecutionWorker (BullMQ consumer) - NEW
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Execution.name, schema: ExecutionSchema },
    ]),
    ScheduleModule.forRoot(), // For @Interval decorator
    forwardRef(() => NodeModule), // For NodeGateway access
    WorkflowModule, // NEW: Workflow template access
    WorkflowStepModule, // NEW: Workflow step access
  ],
  controllers: [ExecutionController],
  providers: [
    ExecutionService,
    ExecutionOrchestrator,
    ExecutionTimeoutMonitor,
    ExecutionOrchestratorService, // NEW: Workflow execution orchestration
    WorkflowExecutionQueue, // NEW: BullMQ queue producer
    WorkflowExecutionWorker, // NEW: BullMQ queue consumer
  ],
  exports: [
    ExecutionService,
    ExecutionOrchestrator,
    ExecutionTimeoutMonitor,
    ExecutionOrchestratorService, // NEW: For testing/debugging
    MongooseModule,
  ],
})
export class ExecutionModule {}
