import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { Execution, ExecutionSchema } from './execution.schema';
import { Workflow, WorkflowSchema } from '../workflow/workflow.schema';
import { WorkflowStep, WorkflowStepSchema } from '../workflow-step/workflow-step.schema';
import { Model as ModelEntity, ModelSchema } from '../model/model.schema';
import { ExecutionService } from './execution.service';
import { ExecutionController } from './execution.controller';
import { ExecutionOrchestrator } from './execution.orchestrator';
import { ExecutionTimeoutMonitor } from './execution-timeout.monitor';
import { NodeModule } from '../node/node.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { WorkflowStepModule } from '../workflow-step/workflow-step.module';
import { DeploymentModule } from '../deployment/deployment.module';
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
 *
 * Mode Support:
 * - API mode: Controllers + Queue Producer (NO Worker)
 * - Worker mode: Worker ONLY (NO Controllers)
 */

// Determine if running in worker mode
const MODE = process.env.MODE || process.argv[2] || 'api';
const isWorkerMode = MODE === 'worker';
const isApiMode = MODE === 'api';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Execution.name, schema: ExecutionSchema },
      { name: Workflow.name, schema: WorkflowSchema },
      { name: WorkflowStep.name, schema: WorkflowStepSchema },
      { name: ModelEntity.name, schema: ModelSchema },
    ]),
    ScheduleModule.forRoot(), // For @Interval decorator
    forwardRef(() => NodeModule), // For NodeGateway access
    WorkflowModule, // NEW: Workflow template access
    WorkflowStepModule, // NEW: Workflow step access
    DeploymentModule, // NEW: For LLM calls via deployments
  ],
  controllers: isApiMode ? [ExecutionController] : [], // Controllers only in API mode
  providers: [
    ExecutionService,
    ExecutionOrchestrator,
    ExecutionTimeoutMonitor,
    ExecutionOrchestratorService, // NEW: Workflow execution orchestration
    WorkflowExecutionQueue, // Queue producer (needed in both modes)
    // Worker only in Worker mode
    ...(isWorkerMode ? [WorkflowExecutionWorker] : []),
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
