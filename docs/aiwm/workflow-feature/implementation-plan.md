# WORKFLOW MVP - IMPLEMENTATION PLAN

## 📋 Project Overview

**Goal**: Implement Workflow Engine MVP for AIWM service using Option A (Extend Execution Module)

**Scope**:
- LLM-only workflow steps (no tool/rule/transform)
- Manual trigger only (no scheduler)
- Basic validation with JSON schema
- Sequential and parallel execution support

**Excluded from MVP**:
- Scheduler integration (Phase 2)
- Tool/Rule/Transform step types (Phase 2)
- Input/Output mapping (Phase 2)
- Advanced error recovery (Phase 2)
- Testing scenarios (separate discussion)

---

## 🏗️ Architecture Overview

### Option A: Extend Execution Module

```
AIWM Service
├── modules/
│   ├── workflow/          ✅ NEW MODULE (clone from tool/)
│   ├── workflow-step/     ✅ NEW MODULE (clone from tool/)
│   ├── execution/         🔧 EXTEND EXISTING
│   ├── deployment/        📖 READ ONLY (for LLM calls)
│   └── instruction/       📖 READ ONLY (for system prompts)
```

### Key Design Decisions

1. **Workflow & WorkflowStep**: Separate modules (stateless templates)
2. **Execution**: Extended with `executionType = 'workflow'` (runtime state)
3. **ExecutionStep**: Embedded documents (not separate collection)
4. **Dependencies**: Array of step indices for execution control
5. **OrderIndex**: Display order for UI (can duplicate for parallel steps)

---

## 📦 Phase 1: Core Entities & Schemas

### Task 1.1: Create Workflow Module

**Action**: Clone `services/aiwm/src/modules/tool/` → `services/aiwm/src/modules/workflow/`

**Files to Create/Modify**:
```
modules/workflow/
├── workflow.controller.ts
├── workflow.service.ts
├── workflow.module.ts
├── schemas/
│   └── workflow.schema.ts
├── dto/
│   ├── create-workflow.dto.ts
│   ├── update-workflow.dto.ts
│   └── workflow-response.dto.ts
└── interfaces/
    └── workflow.interface.ts
```

**Schema Definition** (`workflow.schema.ts`):
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

@Schema({ timestamps: true })
export class Workflow extends BaseSchema {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true, default: 'v1.0' })
  version: string;

  @Prop({
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'draft'
  })
  status: string;

  @Prop({
    type: String,
    enum: ['internal', 'langgraph'],
    default: 'internal'
  })
  executionMode: string;

  @Prop({ type: Object, required: true })
  owner: {
    orgId: string;
    userId: string;
  };
}

export type WorkflowDocument = Workflow & Document;
export const WorkflowSchema = SchemaFactory.createForClass(Workflow);
```

**DTOs**:
```typescript
// create-workflow.dto.ts
export class CreateWorkflowDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  version?: string; // Default: 'v1.0'

  @IsEnum(['draft', 'active', 'archived'])
  @IsOptional()
  status?: string; // Default: 'draft'

  @IsEnum(['internal', 'langgraph'])
  @IsOptional()
  executionMode?: string; // Default: 'internal'
}

// update-workflow.dto.ts
export class UpdateWorkflowDto extends PartialType(CreateWorkflowDto) {}
```

**Service Methods** (`workflow.service.ts`):
```typescript
@Injectable()
export class WorkflowService extends BaseService<Workflow> {
  constructor(
    @InjectModel(Workflow.name) private workflowModel: Model<Workflow>
  ) {
    super(workflowModel);
  }

  // Additional methods
  async findByStatus(status: string, context: RequestContext) {
    return this.workflowModel.find({
      status,
      'owner.orgId': context.orgId
    });
  }

  async activate(id: string, context: RequestContext) {
    // Validate workflow has at least 1 step before activating
    // Change status: draft → active
  }

  async archive(id: string, context: RequestContext) {
    // Change status: active/draft → archived
  }
}
```

**Controller Endpoints** (`workflow.controller.ts`):
```typescript
@Controller('workflows')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post()
  @ApiCreateErrors()
  async create(
    @Body() dto: CreateWorkflowDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.workflowService.create(dto, context);
  }

  @Get()
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: PaginationQueryDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.workflowService.findAll(query, context);
  }

  @Get(':id')
  @ApiReadErrors()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.workflowService.findById(id, context);
  }

  @Put(':id')
  @ApiUpdateErrors()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.workflowService.update(id, dto, context);
  }

  @Delete(':id')
  @ApiDeleteErrors()
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.workflowService.remove(id, context);
  }

  @Put(':id/activate')
  @ApiUpdateErrors()
  async activate(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.workflowService.activate(id, context);
  }

  @Put(':id/archive')
  @ApiUpdateErrors()
  async archive(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.workflowService.archive(id, context);
  }
}
```

---

### Task 1.2: Create WorkflowStep Module

**Action**: Clone `services/aiwm/src/modules/tool/` → `services/aiwm/src/modules/workflow-step/`

**Files to Create/Modify**:
```
modules/workflow-step/
├── workflow-step.controller.ts
├── workflow-step.service.ts
├── workflow-step.module.ts
├── schemas/
│   └── workflow-step.schema.ts
├── dto/
│   ├── create-workflow-step.dto.ts
│   ├── update-workflow-step.dto.ts
│   └── workflow-step-response.dto.ts
└── interfaces/
    └── workflow-step.interface.ts
```

**Schema Definition** (`workflow-step.schema.ts`):
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

@Schema({ timestamps: true })
export class WorkflowStep extends BaseSchema {
  @Prop({ type: Types.ObjectId, ref: 'Workflow', required: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  orderIndex: number;

  @Prop({
    type: String,
    enum: ['llm'],
    required: true
  })
  type: string; // MVP: only 'llm'

  @Prop({ type: Object, required: true })
  llmConfig: {
    deploymentId: string;
    systemPrompt: string;
    userPromptTemplate?: string; // Optional
    parameters?: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
    };
    timeout?: number; // Default: 30000ms
  };

  @Prop({ type: Object })
  inputSchema?: Record<string, any>; // JSON Schema

  @Prop({ type: Object })
  outputSchema?: Record<string, any>; // JSON Schema

  @Prop({ type: [Number], default: [] })
  dependencies: number[]; // Array of step indices

  @Prop({ type: Object, required: true })
  owner: {
    orgId: string;
    userId: string;
  };
}

export type WorkflowStepDocument = WorkflowStep & Document;
export const WorkflowStepSchema = SchemaFactory.createForClass(WorkflowStep);

// Index for efficient queries
WorkflowStepSchema.index({ workflowId: 1, orderIndex: 1 });
```

**DTOs**:
```typescript
// create-workflow-step.dto.ts
export class LLMConfigDto {
  @IsString()
  @IsNotEmpty()
  deploymentId: string;

  @IsString()
  @IsNotEmpty()
  systemPrompt: string;

  @IsString()
  @IsOptional()
  userPromptTemplate?: string;

  @IsObject()
  @IsOptional()
  parameters?: {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
  };

  @IsNumber()
  @IsOptional()
  timeout?: number;
}

export class CreateWorkflowStepDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsNotEmpty()
  orderIndex: number;

  @IsEnum(['llm'])
  @IsNotEmpty()
  type: string;

  @ValidateNested()
  @Type(() => LLMConfigDto)
  llmConfig: LLMConfigDto;

  @IsObject()
  @IsOptional()
  inputSchema?: Record<string, any>;

  @IsObject()
  @IsOptional()
  outputSchema?: Record<string, any>;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  dependencies?: number[];
}

// update-workflow-step.dto.ts
export class UpdateWorkflowStepDto extends PartialType(CreateWorkflowStepDto) {}
```

**Service Methods** (`workflow-step.service.ts`):
```typescript
@Injectable()
export class WorkflowStepService extends BaseService<WorkflowStep> {
  constructor(
    @InjectModel(WorkflowStep.name) private stepModel: Model<WorkflowStep>,
    private readonly workflowService: WorkflowService
  ) {
    super(stepModel);
  }

  async findByWorkflow(workflowId: string, context: RequestContext) {
    // Verify workflow exists and user has access
    await this.workflowService.findById(workflowId, context);

    // Return steps sorted by orderIndex
    return this.stepModel
      .find({
        workflowId,
        'owner.orgId': context.orgId
      })
      .sort({ orderIndex: 1 });
  }

  async validateDependencies(
    workflowId: string,
    dependencies: number[]
  ): Promise<boolean> {
    const steps = await this.stepModel.find({ workflowId });
    const maxIndex = steps.length - 1;

    // Check all dependencies are valid indices
    return dependencies.every(dep => dep >= 0 && dep <= maxIndex);
  }

  async validateDeployment(deploymentId: string, orgId: string): Promise<boolean> {
    // Call DeploymentService to verify deployment exists and is active
    // Return true/false
  }

  override async create(dto: CreateWorkflowStepDto, context: RequestContext) {
    // Validate workflow exists
    await this.workflowService.findById(dto.workflowId, context);

    // Validate deployment exists
    await this.validateDeployment(dto.llmConfig.deploymentId, context.orgId);

    // Create step
    return super.create(dto, context);
  }

  async reorder(workflowId: string, stepOrders: Array<{ stepId: string; orderIndex: number }>, context: RequestContext) {
    // Bulk update orderIndex for multiple steps
  }
}
```

**Controller Endpoints** (`workflow-step.controller.ts`):
```typescript
@Controller('workflow-steps')
@UseGuards(JwtAuthGuard)
export class WorkflowStepController {
  constructor(private readonly stepService: WorkflowStepService) {}

  @Post()
  @ApiCreateErrors()
  async create(
    @Body() dto: CreateWorkflowStepDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.stepService.create(dto, context);
  }

  @Get('workflow/:workflowId')
  @ApiReadErrors({ notFound: false })
  async findByWorkflow(
    @Param('workflowId') workflowId: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.stepService.findByWorkflow(workflowId, context);
  }

  @Get(':id')
  @ApiReadErrors()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.stepService.findById(id, context);
  }

  @Put(':id')
  @ApiUpdateErrors()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowStepDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.stepService.update(id, dto, context);
  }

  @Delete(':id')
  @ApiDeleteErrors()
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.stepService.remove(id, context);
  }

  @Put('workflow/:workflowId/reorder')
  @ApiUpdateErrors()
  async reorder(
    @Param('workflowId') workflowId: string,
    @Body() dto: { stepOrders: Array<{ stepId: string; orderIndex: number }> },
    @CurrentUser() context: RequestContext
  ) {
    return this.stepService.reorder(workflowId, dto.stepOrders, context);
  }
}
```

---

### Task 1.3: Extend Execution Schema

**Action**: Modify `services/aiwm/src/modules/execution/schemas/execution.schema.ts`

**Changes**:

```typescript
// Add new enums
export enum ExecutionType {
  DEPLOYMENT = 'deployment',
  WORKFLOW = 'workflow'
}

export enum ExecutionErrorType {
  VALIDATION_ERROR = 'validation_error',
  EXECUTION_ERROR = 'execution_error',
  TIMEOUT_ERROR = 'timeout_error',
  DEPENDENCY_ERROR = 'dependency_error',
  CONFIGURATION_ERROR = 'configuration_error',
  SYSTEM_ERROR = 'system_error'
}

// Add to Execution schema
@Schema({ timestamps: true })
export class Execution extends BaseSchema {
  // ... existing fields ...

  @Prop({
    type: String,
    enum: Object.values(ExecutionType),
    required: true
  })
  executionType: ExecutionType;

  // Workflow-specific fields
  @Prop({ type: Types.ObjectId, ref: 'Workflow' })
  workflowId?: Types.ObjectId;

  @Prop({ type: String })
  workflowVersion?: string;

  @Prop({ type: Object })
  workflowSnapshot?: {
    name: string;
    description?: string;
    version: string;
    steps: Array<{
      index: number;
      name: string;
      orderIndex: number;
      type: string;
      llmConfig: any;
      inputSchema?: any;
      outputSchema?: any;
      dependencies: number[];
    }>;
  };

  // Result summary
  @Prop({ type: Object })
  result?: {
    success: boolean;
    summary: {
      stepsCompleted: number;
      stepsFailed: number;
      stepsSkipped: number;
      totalTokensUsed?: number;
      totalCost?: number;
      totalDurationMs: number;
    };
    finalOutput?: any;
  };

  // Enhanced error tracking
  @Prop({ type: Object })
  error?: {
    type: ExecutionErrorType;
    message: string;
    code?: string;
    failedStepIndex?: number;
    details?: {
      stepName?: string;
      inputValidationErrors?: any[];
      outputValidationErrors?: any[];
      llmError?: {
        statusCode?: number;
        responseBody?: string;
      };
    };
    stack?: string;
    timestamp: Date;
  };
}
```

**Modify ExecutionStep Embedded Schema**:
```typescript
export class ExecutionStep {
  index: number;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress: number; // 0-100

  type: 'command' | 'llm'; // For deployment vs workflow

  // For deployment type (existing)
  command?: string;
  nodeId?: string;

  // For workflow type (new)
  llmConfig?: {
    deploymentId: string;
    systemPrompt: string;
    userPromptTemplate?: string;
    parameters?: any;
  };

  input?: any;
  output?: any;

  dependencies: number[];

  startedAt?: Date;
  finishedAt?: Date;

  result?: {
    success: boolean;
    statusCode?: number;
    tokensUsed?: number;
  };

  error?: {
    type?: ExecutionErrorType;
    message: string;
    code?: string;
    details?: any;
    stack?: string;
  };

  metadata?: any;
}
```

---

## 🔧 Phase 2: BullMQ Queue Setup

### Task 2.1: Install BullMQ Dependencies

**Action**: Install required packages

```bash
npm install bullmq
npm install ioredis  # Redis client (if not already installed)
```

**Add to package.json**:
```json
{
  "dependencies": {
    "bullmq": "^5.x.x",
    "ioredis": "^5.x.x"
  }
}
```

---

### Task 2.2: Create Queue Infrastructure

**Action**: Create queue and worker infrastructure

**Files to Create**:
```
modules/execution/queues/
├── workflow-execution.queue.ts      # Queue producer
├── workflow-execution.worker.ts     # Queue consumer
├── queue.constants.ts               # Queue & event names
└── index.ts
```

#### queue.constants.ts

```typescript
// Queue names (noun, plural)
export const QUEUE_NAMES = {
  WORKFLOW_EXECUTION: 'workflow-executions',
} as const;

// Job names (verb or action)
export const JOB_NAMES = {
  EXECUTE_WORKFLOW: 'execute-workflow',
} as const;

// Event names (resource:action pattern)
export const WORKFLOW_EVENTS = {
  // Workflow template events
  CREATED: 'workflow:created',
  UPDATED: 'workflow:updated',
  ACTIVATED: 'workflow:activated',
  ARCHIVED: 'workflow:archived',
  DELETED: 'workflow:deleted',

  // Workflow trigger
  TRIGGERED: 'workflow:triggered',
} as const;

export const WORKFLOW_EXECUTION_EVENTS = {
  // Execution lifecycle
  QUEUED: 'workflow-execution:queued',
  STARTED: 'workflow-execution:started',
  COMPLETED: 'workflow-execution:completed',
  FAILED: 'workflow-execution:failed',

  // Step lifecycle
  STEP_STARTED: 'workflow-execution:step-started',
  STEP_COMPLETED: 'workflow-execution:step-completed',
  STEP_FAILED: 'workflow-execution:step-failed',
} as const;

export const WORKFLOW_STEP_EVENTS = {
  CREATED: 'workflow-step:created',
  UPDATED: 'workflow-step:updated',
  DELETED: 'workflow-step:deleted',
  REORDERED: 'workflow-step:reordered',
} as const;
```

#### workflow-execution.queue.ts

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES } from './queue.constants';

@Injectable()
export class WorkflowExecutionQueue {
  private readonly logger = new Logger(WorkflowExecutionQueue.name);
  private queue: Queue;

  constructor() {
    this.queue = new Queue(QUEUE_NAMES.WORKFLOW_EXECUTION, {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 100,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    });

    this.logger.log('Workflow execution queue initialized');
  }

  async addExecutionJob(executionId: string): Promise<void> {
    await this.queue.add(
      JOB_NAMES.EXECUTE_WORKFLOW,
      { executionId },
      {
        jobId: `workflow-exec-${executionId}`, // Prevent duplicates
      }
    );

    this.logger.log(`Added execution job for ${executionId}`);
  }

  async getQueueStatus() {
    return {
      waiting: await this.queue.getWaitingCount(),
      active: await this.queue.getActiveCount(),
      completed: await this.queue.getCompletedCount(),
      failed: await this.queue.getFailedCount(),
    };
  }

  async cleanupOldJobs(): Promise<void> {
    await this.queue.clean(24 * 3600 * 1000, 100, 'completed');
    await this.queue.clean(7 * 24 * 3600 * 1000, 100, 'failed');
    this.logger.log('Cleaned up old queue jobs');
  }
}
```

#### workflow-execution.worker.ts

```typescript
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES } from './queue.constants';
import { ExecutionOrchestratorService } from '../services/execution-orchestrator.service';

@Injectable()
export class WorkflowExecutionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowExecutionWorker.name);
  private worker: Worker;

  constructor(
    private readonly orchestrator: ExecutionOrchestratorService,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      QUEUE_NAMES.WORKFLOW_EXECUTION,
      async (job: Job) => {
        this.logger.log(`Processing job ${job.id}: ${job.name}`);
        const { executionId } = job.data;

        try {
          await this.orchestrator.executeWorkflow(executionId);
          this.logger.log(`Workflow execution ${executionId} completed`);
        } catch (error) {
          this.logger.error(
            `Workflow execution ${executionId} failed: ${error.message}`,
            error.stack
          );
          throw error; // Re-throw to trigger BullMQ retry
        }
      },
      {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
        concurrency: parseInt(process.env.WORKFLOW_WORKER_CONCURRENCY || '5'),
      }
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log('Workflow execution worker started');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.logger.log('Workflow execution worker stopped');
  }
}
```

---

## 🔧 Phase 3: Execution Orchestration

### Task 3.1: Create ExecutionOrchestrator Service

**Action**: Create `services/aiwm/src/modules/execution/services/execution-orchestrator.service.ts`

**Purpose**: Handle workflow execution logic (step sequencing, dependency resolution, parallel execution)

```typescript
@Injectable()
export class ExecutionOrchestratorService {
  constructor(
    @InjectModel(Execution.name) private executionModel: Model<Execution>,
    private readonly deploymentService: DeploymentService,
    private readonly instructionService: InstructionService
  ) {}

  async executeWorkflow(execution: Execution): Promise<void> {
    try {
      // Update execution status to 'running'
      await this.updateExecutionStatus(execution._id, 'running');

      // Process steps based on dependencies
      await this.processSteps(execution);

      // Calculate final result
      const result = this.calculateResult(execution);

      // Update execution with result
      await this.updateExecutionResult(execution._id, result);
      await this.updateExecutionStatus(execution._id, 'completed');
    } catch (error) {
      await this.handleExecutionError(execution._id, error);
    }
  }

  private async processSteps(execution: Execution): Promise<void> {
    const steps = execution.steps;
    let pendingSteps = steps.filter(s => s.status === 'pending');

    while (pendingSteps.length > 0) {
      // Find steps that are ready to execute
      const readySteps = this.findReadySteps(execution);

      if (readySteps.length === 0) {
        // No steps ready = circular dependency or all remaining steps have failed dependencies
        this.markRemainingAsSkipped(execution);
        break;
      }

      // Execute ready steps in parallel
      await Promise.all(
        readySteps.map(step => this.executeStep(execution, step))
      );

      // Refresh pending steps
      pendingSteps = execution.steps.filter(s => s.status === 'pending');
    }
  }

  private findReadySteps(execution: Execution): ExecutionStep[] {
    return execution.steps.filter(step => {
      if (step.status !== 'pending') return false;

      // Check if all dependencies are completed
      return step.dependencies.every(depIndex => {
        const depStep = execution.steps[depIndex];
        return depStep && depStep.status === 'completed';
      });
    });
  }

  private async executeStep(execution: Execution, step: ExecutionStep): Promise<void> {
    try {
      // Update step status to 'running'
      step.status = 'running';
      step.startedAt = new Date();
      await this.saveExecution(execution);

      // Build input from dependencies
      const input = this.buildStepInput(execution, step);

      // Validate input against schema
      if (step.inputSchema) {
        this.validateInput(input, step.inputSchema);
      }

      // Execute based on type
      let output: any;
      if (step.type === 'llm') {
        output = await this.executeLLMStep(step, input);
      } else {
        throw new Error(`Unknown step type: ${step.type}`);
      }

      // Validate output against schema
      if (step.outputSchema) {
        this.validateOutput(output, step.outputSchema);
      }

      // Update step with result
      step.status = 'completed';
      step.progress = 100;
      step.output = output;
      step.finishedAt = new Date();
      step.result = {
        success: true,
        tokensUsed: output.tokensUsed
      };

      await this.saveExecution(execution);
    } catch (error) {
      await this.handleStepError(execution, step, error);
    }
  }

  private buildStepInput(execution: Execution, step: ExecutionStep): any {
    if (step.dependencies.length === 0) {
      // First step: use workflow input
      return execution.input;
    } else if (step.dependencies.length === 1) {
      // Single dependency: use previous step output
      const prevStep = execution.steps[step.dependencies[0]];
      return prevStep.output;
    } else {
      // Multiple dependencies: combine outputs
      const inputs = step.dependencies.map(depIndex => {
        return execution.steps[depIndex].output;
      });
      return { inputs }; // Wrap in object
    }
  }

  private async executeLLMStep(step: ExecutionStep, input: any): Promise<any> {
    const { deploymentId, systemPrompt, userPromptTemplate, parameters } = step.llmConfig;

    // Get deployment
    const deployment = await this.deploymentService.findById(deploymentId);
    if (!deployment || deployment.status !== 'active') {
      throw new ConfigurationError(`Deployment ${deploymentId} not found or inactive`);
    }

    // Build user prompt
    const userPrompt = this.buildUserPrompt(userPromptTemplate, input);

    // Call LLM via deployment
    const response = await this.callLLM({
      deployment,
      systemPrompt,
      userPrompt,
      parameters
    });

    return response;
  }

  private buildUserPrompt(template: string | undefined, input: any): string {
    if (template) {
      // Use Handlebars to render template
      const compiledTemplate = Handlebars.compile(template);
      return compiledTemplate(input);
    } else {
      // Fallback to JSON.stringify
      if (typeof input === 'string') {
        return input;
      } else {
        return JSON.stringify(input, null, 2);
      }
    }
  }

  private validateInput(input: any, schema: any): void {
    // Use Ajv or class-validator to validate
    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    const valid = validate(input);

    if (!valid) {
      throw new ValidationError('Input validation failed', validate.errors);
    }
  }

  private validateOutput(output: any, schema: any): void {
    // Similar to validateInput
  }

  private async handleStepError(execution: Execution, step: ExecutionStep, error: any): Promise<void> {
    step.status = 'failed';
    step.finishedAt = new Date();
    step.error = {
      type: this.classifyError(error),
      message: error.message,
      code: error.code,
      details: error.details,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };

    await this.saveExecution(execution);

    // Mark dependent steps as skipped
    this.markDependentStepsAsSkipped(execution, step.index);
  }

  private markDependentStepsAsSkipped(execution: Execution, failedStepIndex: number): void {
    execution.steps.forEach(step => {
      if (step.dependencies.includes(failedStepIndex) && step.status === 'pending') {
        step.status = 'skipped';
      }
    });
  }

  private classifyError(error: any): ExecutionErrorType {
    if (error instanceof ValidationError) return ExecutionErrorType.VALIDATION_ERROR;
    if (error instanceof TimeoutError) return ExecutionErrorType.TIMEOUT_ERROR;
    if (error instanceof ConfigurationError) return ExecutionErrorType.CONFIGURATION_ERROR;
    // ... more classifications
    return ExecutionErrorType.SYSTEM_ERROR;
  }

  private calculateResult(execution: Execution) {
    const steps = execution.steps;
    return {
      success: steps.every(s => s.status === 'completed' || s.status === 'skipped'),
      summary: {
        stepsCompleted: steps.filter(s => s.status === 'completed').length,
        stepsFailed: steps.filter(s => s.status === 'failed').length,
        stepsSkipped: steps.filter(s => s.status === 'skipped').length,
        totalTokensUsed: steps.reduce((sum, s) => sum + (s.result?.tokensUsed || 0), 0),
        totalDurationMs: execution.finishedAt.getTime() - execution.startedAt.getTime()
      },
      finalOutput: this.getFinalOutput(execution)
    };
  }

  private getFinalOutput(execution: Execution): any {
    // Return output of last completed step
    const completedSteps = execution.steps
      .filter(s => s.status === 'completed')
      .sort((a, b) => b.index - a.index);

    return completedSteps[0]?.output;
  }
}
```

---

### Task 3.2: Extend ExecutionService with Queue & Events

**Action**: Modify `services/aiwm/src/modules/execution/execution.service.ts`

**Add Dependencies** + **Event Emitters**:

```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WORKFLOW_EVENTS, WORKFLOW_EXECUTION_EVENTS } from './queues/queue.constants';

@Injectable()
export class ExecutionService extends BaseService<Execution> {
  constructor(
    @InjectModel(Execution.name) private executionModel: Model<Execution>,
    private readonly workflowService: WorkflowService,
    private readonly workflowStepService: WorkflowStepService,
    private readonly workflowQueue: WorkflowExecutionQueue,  // ✅ NEW: Queue
    private readonly eventEmitter: EventEmitter2  // ✅ NEW: Event emitter
  ) {
    super(executionModel);
  }

  async triggerWorkflow(
    workflowId: string,
    input: any,
    context: RequestContext
  ): Promise<Execution> {
    // 1. Get workflow
    const workflow = await this.workflowService.findById(workflowId, context);

    if (workflow.status !== 'active') {
      throw new BadRequestException('Workflow is not active');
    }

    // 2. Get workflow steps
    const steps = await this.workflowStepService.findByWorkflow(workflowId, context);

    if (steps.length === 0) {
      throw new BadRequestException('Workflow has no steps');
    }

    // 3. Create workflow snapshot
    const workflowSnapshot = {
      name: workflow.name,
      description: workflow.description,
      version: workflow.version,
      steps: steps.map((step, index) => ({
        index,
        name: step.name,
        orderIndex: step.orderIndex,
        type: step.type,
        llmConfig: step.llmConfig,
        inputSchema: step.inputSchema,
        outputSchema: step.outputSchema,
        dependencies: step.dependencies
      }))
    };

    // 4. Create execution steps
    const executionSteps: ExecutionStep[] = steps.map((step, index) => ({
      index,
      name: step.name,
      status: 'pending',
      progress: 0,
      type: 'llm',
      llmConfig: step.llmConfig,
      dependencies: step.dependencies,
      input: null,
      output: null,
      metadata: {}
    }));

    // 5. Create execution
    const execution = await this.create({
      executionType: ExecutionType.WORKFLOW,
      name: `${workflow.name} - Execution`,
      workflowId: workflow._id,
      workflowVersion: workflow.version,
      workflowSnapshot,
      input,
      steps: executionSteps,
      status: 'pending',
      owner: context
    }, context);

    // 6. ✅ Emit workflow:triggered event
    this.eventEmitter.emit(WORKFLOW_EVENTS.TRIGGERED, {
      workflowId,
      executionId: execution.executionId,
      triggeredBy: context.userId
    });

    // 7. ✅ Push to BullMQ queue
    await this.workflowQueue.addExecutionJob(execution.executionId);

    // 8. ✅ Emit workflow-execution:queued event
    this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.QUEUED, {
      executionId: execution.executionId,
      workflowId
    });

    return execution;
  }

  async getExecutionStatus(executionId: string, context: RequestContext) {
    const execution = await this.findById(executionId, context);

    return {
      executionId: execution.executionId,
      status: execution.status,
      progress: execution.progress,
      steps: execution.steps.map(step => ({
        index: step.index,
        name: step.name,
        status: step.status,
        progress: step.progress,
        error: step.error
      })),
      result: execution.result,
      error: execution.error
    };
  }
}
```

---

### Task 3.3: Add Event Emitters to Orchestrator

**Action**: Update `ExecutionOrchestratorService` to emit events

```typescript
import { WORKFLOW_EXECUTION_EVENTS } from '../queues/queue.constants';

@Injectable()
export class ExecutionOrchestratorService {
  constructor(
    private readonly eventEmitter: EventEmitter2
  ) {}

  async executeWorkflow(executionId: string) {
    const execution = await this.executionService.findByExecutionId(executionId);

    // ✅ Emit: workflow-execution:started
    this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.STARTED, {
      executionId,
      workflowId: execution.workflowId
    });

    try {
      // Update status to running
      await this.executionService.updateStatus(executionId, 'running');

      // Process steps
      await this.processSteps(execution);

      // ✅ Emit: workflow-execution:completed
      this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.COMPLETED, {
        executionId,
        result: execution.result
      });
    } catch (error) {
      // ✅ Emit: workflow-execution:failed
      this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.FAILED, {
        executionId,
        error: error.message
      });
      throw error;
    }
  }

  async executeStep(execution: Execution, step: ExecutionStep) {
    // ✅ Emit: workflow-execution:step-started
    this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.STEP_STARTED, {
      executionId: execution.executionId,
      stepIndex: step.index,
      stepName: step.name
    });

    try {
      // Execute step...
      const output = await this.executeLLMStep(step);

      // ✅ Emit: workflow-execution:step-completed
      this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.STEP_COMPLETED, {
        executionId: execution.executionId,
        stepIndex: step.index,
        output
      });
    } catch (error) {
      // ✅ Emit: workflow-execution:step-failed
      this.eventEmitter.emit(WORKFLOW_EXECUTION_EVENTS.STEP_FAILED, {
        executionId: execution.executionId,
        stepIndex: step.index,
        error: error.message
      });
      throw error;
    }
  }
}
```

---

### Task 3.4: Update Execution Controller

**Action**: Modify `services/aiwm/src/modules/execution/execution.controller.ts`

**Simplified API** (no POST /start, queue handles it):

```typescript
@Controller('executions')
@UseGuards(JwtAuthGuard)
export class ExecutionController {
  // ... existing endpoints ...

  @Post('workflows/:workflowId/trigger')
  @ApiCreateErrors()
  async triggerWorkflow(
    @Param('workflowId') workflowId: string,
    @Body() dto: { input: any },
    @CurrentUser() context: RequestContext
  ) {
    const execution = await this.executionService.triggerWorkflow(
      workflowId,
      dto.input,
      context
    );

    return {
      executionId: execution.executionId,
      status: 'queued',
      message: 'Workflow execution queued successfully'
    };
  }

  @Get(':executionId')
  @ApiReadErrors()
  async getStatus(
    @Param('executionId') executionId: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.executionService.getExecutionStatus(executionId, context);
  }

  // ✅ NEW: Queue status endpoint (admin)
  @Get('admin/queue/status')
  @ApiReadErrors({ notFound: false })
  async getQueueStatus() {
    return this.workflowQueue.getQueueStatus();
  }
}
```

---

## 📚 Phase 4: Module Registration & EventEmitter Setup

### Task 3.1: Register New Modules

**Action**: Update `services/aiwm/src/app.module.ts`

```typescript
import { WorkflowModule } from './modules/workflow/workflow.module';
import { WorkflowStepModule } from './modules/workflow-step/workflow-step.module';

@Module({
  imports: [
    // ... existing modules ...
    WorkflowModule,
    WorkflowStepModule,
    ExecutionModule // Already exists, just extend
  ]
})
export class AppModule {}
```

---

## 🔍 Phase 4: Validation & Error Handling

### Task 4.1: Add Custom Error Classes

**Action**: Create `services/aiwm/src/modules/execution/errors/`

```typescript
// validation.error.ts
export class ValidationError extends Error {
  constructor(message: string, public errors?: any[]) {
    super(message);
    this.name = 'ValidationError';
  }
}

// configuration.error.ts
export class ConfigurationError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

// timeout.error.ts
export class TimeoutError extends Error {
  constructor(message: string, public timeoutMs?: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}
```

---

### Task 4.2: Add JSON Schema Validation

**Action**: Install Ajv and create validation utilities

```bash
npm install ajv
```

**Create** `services/aiwm/src/modules/execution/utils/schema-validator.ts`:

```typescript
import Ajv from 'ajv';
import { ValidationError } from '../errors/validation.error';

export class SchemaValidator {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ allErrors: true });
  }

  validate(data: any, schema: any): void {
    const validate = this.ajv.compile(schema);
    const valid = validate(data);

    if (!valid) {
      throw new ValidationError(
        'Schema validation failed',
        validate.errors
      );
    }
  }
}
```

---

## 🛠️ Phase 5: Dependencies & Integration

### Task 5.1: Install Required Packages

```bash
# JSON Schema validation
npm install ajv

# Template engine for userPromptTemplate
npm install handlebars
npm install @types/handlebars --save-dev
```

---

### Task 5.2: Integration with Deployment Module

**Action**: Ensure ExecutionOrchestrator can call DeploymentService

- Import DeploymentModule in ExecutionModule
- Use DeploymentService to:
  - Validate deployment exists and is active
  - Get model configuration
  - Call LLM API

---

## 📖 Phase 6: API Documentation

### Task 6.1: Update Swagger Documentation

**Action**: Add Swagger decorators to all controllers

```typescript
// workflow.controller.ts
@ApiTags('Workflows')
@ApiBearerAuth()
export class WorkflowController {
  @Post()
  @ApiOperation({ summary: 'Create a new workflow template' })
  @ApiResponse({ status: 201, description: 'Workflow created successfully' })
  async create(...) {}

  // ... other endpoints with decorators
}
```

---

### Task 6.2: Create API Documentation

**Action**: Create `docs/aiwm/workflow-feature/api-reference.md`

Include:
- Endpoint list with descriptions
- Request/response examples
- cURL command examples
- Error codes and handling

---

## 🎯 Implementation Checklist

### Phase 1: Core Entities (Estimated: Day 1-2)

- [ ] Clone Tool module → Workflow module
  - [ ] Rename all files and classes
  - [ ] Update schema definition
  - [ ] Create DTOs
  - [ ] Implement service methods
  - [ ] Create controller endpoints
  - [ ] Register in AppModule

- [ ] Clone Tool module → WorkflowStep module
  - [ ] Rename all files and classes
  - [ ] Update schema definition
  - [ ] Create DTOs (including LLMConfigDto)
  - [ ] Implement service methods (with dependency validation)
  - [ ] Create controller endpoints
  - [ ] Register in AppModule

- [ ] Extend Execution schema
  - [ ] Add executionType enum
  - [ ] Add workflow-specific fields
  - [ ] Add error type enum
  - [ ] Update ExecutionStep embedded schema
  - [ ] Create migration script (if needed)

### Phase 2: Orchestration (Estimated: Day 3-4)

- [ ] Create ExecutionOrchestratorService
  - [ ] Implement executeWorkflow()
  - [ ] Implement processSteps()
  - [ ] Implement findReadySteps()
  - [ ] Implement executeStep()
  - [ ] Implement buildStepInput()
  - [ ] Implement executeLLMStep()
  - [ ] Implement buildUserPrompt() with Handlebars
  - [ ] Implement error handling methods

- [ ] Extend ExecutionService
  - [ ] Add triggerWorkflow()
  - [ ] Add startExecution()
  - [ ] Add getExecutionStatus()

- [ ] Update ExecutionController
  - [ ] Add POST /executions/workflows/:id/trigger
  - [ ] Add POST /executions/:id/start
  - [ ] Add GET /executions/:id/status

### Phase 3: Validation & Error Handling (Estimated: Day 5)

- [ ] Install dependencies (Ajv, Handlebars)
- [ ] Create custom error classes
  - [ ] ValidationError
  - [ ] ConfigurationError
  - [ ] TimeoutError
- [ ] Create SchemaValidator utility
- [ ] Implement input/output validation in orchestrator

### Phase 4: Integration & Testing (Estimated: Day 6-7)

- [ ] Integrate with DeploymentModule
- [ ] Integrate with InstructionModule (if needed)
- [ ] Manual API testing with Postman/cURL
- [ ] Build verification: `npx nx build aiwm`
- [ ] Start service: `npx nx serve aiwm`
- [ ] Test health check: `curl http://localhost:3003/health`

### Phase 5: Documentation (Estimated: Day 8)

- [ ] Update Swagger decorators
- [ ] Create API reference document
- [ ] Update AIWM README with Workflow section
- [ ] Create example workflows in documentation

---

## 📝 Notes & Considerations

### Cloning Strategy

When cloning Tool module:

1. **Copy entire directory structure**:
   ```bash
   cp -r services/aiwm/src/modules/tool services/aiwm/src/modules/workflow
   ```

2. **Find & Replace**:
   - Tool → Workflow
   - tool → workflow
   - TOOL → WORKFLOW

3. **Update imports**:
   - Verify all imports point to correct paths
   - Update module dependencies in `*.module.ts`

4. **Schema customization**:
   - Replace Tool schema fields with Workflow fields
   - Keep BaseSchema extension
   - Keep timestamps and owner pattern

### Execution Type Discrimination

When querying Executions:

```typescript
// Get only workflow executions
await Execution.find({ executionType: 'workflow' });

// Get only deployment executions
await Execution.find({ executionType: 'deployment' });
```

### Parallel Execution Logic

Steps with same orderIndex CAN execute in parallel if dependencies allow:

```typescript
// Example: Steps 1 and 2 both have orderIndex=1 and dependencies=[0]
// They will execute in parallel after step 0 completes
const readySteps = findReadySteps(execution); // Returns [step1, step2]
await Promise.all(readySteps.map(s => executeStep(s))); // Parallel execution
```

### Error Recovery (Future Phase 2)

MVP does not include:
- Retry logic for failed steps
- Pause/resume execution
- Manual intervention for failed steps

These will be added in Phase 2.

---

## 🚀 Getting Started

1. **Review Design Document**: Read `workflow-mvp-design.md`
2. **Start with Phase 1**: Create Workflow and WorkflowStep modules
3. **Incremental Development**: Complete each phase before moving to next
4. **Test Frequently**: Use curl commands to test each endpoint
5. **Ask Questions**: Clarify any uncertainties before implementation

---

## 📞 Contact & Review

Before starting implementation:
- Review this plan with team
- Confirm approach and timeline
- Clarify any ambiguous requirements
- Get approval to proceed

**Status**: ⏸️ Awaiting approval to begin implementation
