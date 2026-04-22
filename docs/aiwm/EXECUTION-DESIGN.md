# AIWM Execution Design

**Version:** 1.0
**Last Updated:** 2025-11-13
**Status:** 🟡 Design Phase

---

## 📋 Overview

Thiết kế **Execution Entity** cho pure event-based orchestration trong AIWM Service. Execution entity theo dõi tiến trình của các tác vụ phức tạp (multi-step workflows) thông qua WebSocket events.

**Use Cases:**
- Triển khai model (download → deploy → configure proxy)
- Cài đặt agent (download dependencies → setup → register)
- Batch operations (deploy multiple models)
- Node maintenance workflows

---

## 🗄️ Execution Schema

### MongoDB Schema

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ExecutionDocument = Execution & Document;

@Schema({ timestamps: true })
export class Execution extends BaseSchema {
  @Prop({ required: true, unique: true })
  executionId: string; // UUID v4

  @Prop({ required: true })
  name: string; // Human-readable execution name

  @Prop()
  description?: string;

  // Execution type and category
  @Prop({
    required: true,
    enum: ['deployment', 'model', 'agent', 'maintenance', 'batch']
  })
  category: string;

  @Prop({ required: true })
  type: string; // e.g., 'deploy-model', 'download-model', 'setup-agent'

  // Status tracking
  @Prop({
    required: true,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'timeout'],
    default: 'pending'
  })
  status: string;

  @Prop({ default: 0, min: 0, max: 100 })
  progress: number; // Percentage (0-100)

  // Parent-child relationship for composite executions
  @Prop({ type: String, ref: 'Execution' })
  parentExecutionId?: string;

  @Prop({ type: [{ type: String, ref: 'Execution' }], default: [] })
  childExecutionIds: string[];

  // Steps (embedded documents)
  @Prop({ type: [ExecutionStepSchema], default: [] })
  steps: ExecutionStep[];

  // Related resources
  @Prop()
  resourceType?: string; // 'deployment', 'model', 'node', 'agent'

  @Prop()
  resourceId?: string; // Foreign key to related resource

  // Node assignment
  @Prop({ type: String, ref: 'Node' })
  nodeId?: string; // Primary node executing this execution

  @Prop({ type: [String], default: [] })
  involvedNodeIds: string[]; // All nodes involved in execution

  // Timing
  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ required: true })
  timeoutSeconds: number; // Execution timeout in seconds

  @Prop()
  timeoutAt?: Date; // Calculated timeout deadline

  // Result and error tracking
  @Prop({ type: Object })
  result?: Record<string, any>; // Execution result data

  @Prop({ type: Object })
  error?: {
    code: string;
    message: string;
    details?: any;
    nodeId?: string; // Which node caused the error
    stepIndex?: number; // Which step failed
  };

  // WebSocket message tracking
  @Prop({ type: [String], default: [] })
  sentMessageIds: string[]; // WebSocket messages sent for this execution

  @Prop({ type: [String], default: [] })
  receivedMessageIds: string[]; // WebSocket messages received

  // Retry configuration
  @Prop({ default: 0 })
  retryCount: number; // Number of retry attempts

  @Prop({ default: 3 })
  maxRetries: number; // Maximum retry attempts

  @Prop({ type: [Date], default: [] })
  retryAttempts: Date[]; // Timestamps of retry attempts

  // Metadata
  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>; // Additional execution-specific data

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, etc.
}

export const ExecutionSchema = SchemaFactory.createForClass(Execution);

// Indexes
ExecutionSchema.index({ executionId: 1 }, { unique: true });
ExecutionSchema.index({ status: 1, createdAt: -1 });
ExecutionSchema.index({ parentExecutionId: 1 });
ExecutionSchema.index({ resourceType: 1, resourceId: 1 });
ExecutionSchema.index({ nodeId: 1, status: 1 });
ExecutionSchema.index({ timeoutAt: 1 }, { sparse: true });
```

---

## 📦 ExecutionStep Schema (Embedded)

```typescript
@Schema({ _id: false })
export class ExecutionStep {
  @Prop({ required: true })
  index: number; // 0, 1, 2, ... (execution order)

  @Prop({ required: true })
  name: string; // e.g., 'Download model', 'Start container'

  @Prop()
  description?: string;

  @Prop({
    required: true,
    enum: ['pending', 'running', 'completed', 'failed', 'skipped']
  })
  status: string;

  @Prop({ default: 0, min: 0, max: 100 })
  progress: number;

  // WebSocket command to execute
  @Prop({ type: Object })
  command?: {
    type: string; // e.g., 'model.download', 'deployment.create'
    resource: {
      type: string;
      id: string;
    };
    data: Record<string, any>;
  };

  // Node assignment
  @Prop()
  nodeId?: string; // Which node executes this step

  // Timing
  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  timeoutSeconds?: number; // Step specific timeout

  // Result
  @Prop({ type: Object })
  result?: Record<string, any>;

  @Prop({ type: Object })
  error?: {
    code: string;
    message: string;
    details?: any;
  };

  // Message tracking
  @Prop()
  sentMessageId?: string; // WebSocket message ID sent

  @Prop()
  receivedMessageId?: string; // WebSocket message ID received

  // Dependencies
  @Prop({ type: [Number], default: [] })
  dependsOn: number[]; // Indexes of steps that must complete first

  @Prop({ default: false })
  optional: boolean; // Can be skipped if failed
}

export const ExecutionStepSchema = SchemaFactory.createForClass(ExecutionStep);
```

---

## 🔄 Execution Lifecycle States

### State Diagram

```
pending ──┐
          │
          ├──> running ──┬──> completed
          │              │
          │              ├──> failed ──> (retry?) ──> running
          │              │
          │              ├──> timeout ──> (retry?) ──> running
          │              │
          └──────────────┴──> cancelled
```

### State Definitions

| State | Description | Can Transition To |
|-------|-------------|-------------------|
| **pending** | Execution created, waiting to start | running, cancelled |
| **running** | Execution is executing | completed, failed, timeout, cancelled |
| **completed** | Execution finished successfully | - |
| **failed** | Execution failed (may retry) | running (if retry), - |
| **timeout** | Execution exceeded timeout | running (if retry), - |
| **cancelled** | Execution manually cancelled | - |

---

## 📨 Event-Driven Workflow

### Example: Deploy Model Workflow

```typescript
// Step 0: User requests deployment
POST /api/deployments
{
  "name": "Whisper ASR API",
  "modelId": "whisper-v3",
  "nodeId": "gpu-node-01",
  "proxyNodeId": "proxy-node-01"
}

// Step 1: Controller creates Deployment record
const deployment = await Deployment.create({
  deploymentId: 'deploy-abc123',
  modelId: 'whisper-v3',
  nodeId: 'gpu-node-01',
  status: 'deploying'
});

// Step 2: Controller creates Execution record with 3 steps
const execution = await Execution.create({
  executionId: 'exec-xyz789',
  name: 'Deploy Whisper ASR API',
  category: 'deployment',
  type: 'deploy-model',
  status: 'pending',
  resourceType: 'deployment',
  resourceId: 'deploy-abc123',
  involvedNodeIds: ['gpu-node-01', 'proxy-node-01'],
  timeoutSeconds: 600, // 10 minutes total
  steps: [
    {
      index: 0,
      name: 'Download model',
      status: 'pending',
      nodeId: 'gpu-node-01',
      timeoutSeconds: 300,
      command: {
        type: 'model.download',
        resource: { type: 'model', id: 'whisper-v3' },
        data: {
          source: 'huggingface',
          sourcePath: 'openai/whisper-large-v3',
          targetPath: '/models/whisper-v3'
        }
      },
      dependsOn: []
    },
    {
      index: 1,
      name: 'Start inference container',
      status: 'pending',
      nodeId: 'gpu-node-01',
      timeoutSeconds: 120,
      command: {
        type: 'deployment.create',
        resource: { type: 'deployment', id: 'deploy-abc123' },
        data: {
          modelId: 'whisper-v3',
          containerImage: 'nvcr.io/nvidia/tritonserver:24.01-py3',
          gpuDeviceId: '0',
          port: 8000
        }
      },
      dependsOn: [0] // Depends on step 0 completing
    },
    {
      index: 2,
      name: 'Configure proxy route',
      status: 'pending',
      nodeId: 'proxy-node-01',
      timeoutSeconds: 30,
      command: {
        type: 'proxy.configure',
        resource: { type: 'proxy', id: 'proxy-whisper-v3' },
        data: {
          subPath: '/api/models/whisper-v3',
          targetUrl: 'http://192.168.1.100:8000',
          modelId: 'whisper-v3'
        }
      },
      dependsOn: [1] // Depends on step 1 completing
    }
  ]
});

// Step 3: Controller starts execution orchestration
await executionOrchestrator.executeExecution(execution.executionId);

// Step 4: ExecutionOrchestrator sends WebSocket commands to nodes
// Step 0 → gpu-node-01
socket.to(socketIdForNode['gpu-node-01']).emit('message', {
  type: 'model.download',
  messageId: 'msg-001',
  timestamp: '2025-11-13T10:00:00Z',
  resource: { type: 'model', id: 'whisper-v3' },
  data: {
    executionId: 'exec-xyz789',      // ← Parent execution ID
    stepIndex: 0,                     // ← Which step
    source: 'huggingface',
    sourcePath: 'openai/whisper-large-v3',
    targetPath: '/models/whisper-v3'
  },
  metadata: {
    correlationId: 'deploy-abc123',
    priority: 'normal'
  }
});

// Step 5: Node responds with immediate ACK
// gpu-node-01 → Controller
{
  type: 'command.ack',
  messageId: 'msg-ack-001',
  originalMessageId: 'msg-001',
  timestamp: '2025-11-13T10:00:01Z',
  status: 'accepted',
  estimatedDuration: 240
}

// Step 6: Node sends progress updates
// gpu-node-01 → Controller
{
  type: 'model.downloadProgress',
  messageId: 'msg-progress-001',
  timestamp: '2025-11-13T10:02:00Z',
  resource: { type: 'model', id: 'whisper-v3' },
  data: {
    executionId: 'exec-xyz789',
    stepIndex: 0,
    progress: 45,
    downloadedBytes: 2500000000,
    totalBytes: 5500000000,
    status: 'downloading'
  }
}

// Controller updates step progress
await Execution.updateOne(
  { executionId: 'exec-xyz789' },
  {
    $set: {
      'steps.0.status': 'running',
      'steps.0.progress': 45
    }
  }
);

// Step 7: Node completes step
// gpu-node-01 → Controller
{
  type: 'command.result',
  messageId: 'msg-result-001',
  originalMessageId: 'msg-001',
  timestamp: '2025-11-13T10:04:30Z',
  status: 'success',
  data: {
    executionId: 'exec-xyz789',      // ← Parent execution ID
    stepIndex: 0,                     // ← Which step completed
    modelPath: '/models/whisper-v3',
    sizeBytes: 5500000000,
    checksum: 'sha256:abc123...'
  }
}

// Controller updates step and calculates overall progress
await Execution.updateOne(
  { executionId: 'exec-xyz789' },
  {
    $set: {
      'steps.0.status': 'completed',
      'steps.0.progress': 100,
      'steps.0.completedAt': new Date(),
      'steps.0.result': {
        modelPath: '/models/whisper-v3',
        sizeBytes: 5500000000
      },
      progress: 33 // 1/3 steps done
    }
  }
);

// Step 8: ExecutionOrchestrator checks dependencies and starts next step
// Step 1 depends on step 0 → Now can execute
// Sends 'deployment.create' command to gpu-node-01...

// Step 9: All steps complete → Execution completed
await Execution.updateOne(
  { executionId: 'exec-xyz789' },
  {
    $set: {
      status: 'completed',
      progress: 100,
      completedAt: new Date()
    }
  }
);

// Step 10: Update Deployment status
await Deployment.updateOne(
  { deploymentId: 'deploy-abc123' },
  {
    $set: {
      status: 'running',
      endpoint: 'https://api.domain/api/models/whisper-v3',
      isRunning: true
    }
  }
);

// Step 11: Notify user via NOTI Service
await notiQueue.add('service.event', {
  event: 'service.event',
  data: {
    name: 'deployment.completed',
    data: {
      deploymentId: 'deploy-abc123',
      executionId: 'exec-xyz789',
      duration: 270,
      endpoint: 'https://api.domain/api/models/whisper-v3'
    },
    recipients: { userIds: [userId] }
  }
});
```

---

## 🔧 Key Components Implementation

### 1. ExecutionService (CRUD + State Management)

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { Execution, ExecutionDocument } from './execution.schema';

@Injectable()
export class ExecutionService extends BaseService<Execution> {
  constructor(@InjectModel(Execution.name) private executionModel: Model<ExecutionDocument>) {
    super(executionModel);
  }

  /**
   * Create a new execution with steps
   */
  async createExecution(dto: CreateExecutionDto, context: RequestContext): Promise<Execution> {
    const executionId = generateUUID();
    const timeoutAt = new Date(Date.now() + dto.timeoutSeconds * 1000);

    const execution = await this.executionModel.create({
      ...dto,
      executionId,
      status: 'pending',
      progress: 0,
      timeoutAt,
      owner: context.orgId,
      createdBy: context.userId
    });

    return execution;
  }

  /**
   * Update step status and recalculate overall progress
   */
  async updateStepStatus(
    executionId: string,
    stepIndex: number,
    update: {
      status?: string;
      progress?: number;
      result?: any;
      error?: any;
    }
  ): Promise<Execution> {
    const execution = await this.executionModel.findOne({ executionId });
    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    const step = execution.steps[stepIndex];
    if (!step) {
      throw new NotFoundException(`Step ${stepIndex} not found in execution ${executionId}`);
    }

    // Update step
    Object.assign(step, update);
    if (update.status === 'completed' || update.status === 'failed') {
      step.completedAt = new Date();
    }

    // Recalculate overall progress
    const completedCount = execution.steps.filter(st => st.status === 'completed').length;
    const totalCount = execution.steps.length;
    execution.progress = Math.round((completedCount / totalCount) * 100);

    // Check if all steps completed
    const allCompleted = execution.steps.every(st =>
      st.status === 'completed' || st.status === 'skipped'
    );
    const anyFailed = execution.steps.some(st => st.status === 'failed' && !st.optional);

    if (allCompleted) {
      execution.status = 'completed';
      execution.completedAt = new Date();
    } else if (anyFailed) {
      execution.status = 'failed';
      execution.completedAt = new Date();
      execution.error = {
        code: 'STEP_FAILED',
        message: `Step ${stepIndex} failed`,
        stepIndex,
        nodeId: step.nodeId
      };
    }

    await execution.save();
    return execution;
  }

  /**
   * Get next pending step that can be executed (dependencies met)
   */
  async getNextPendingStep(executionId: string): Promise<{ index: number; step: ExecutionStep } | null> {
    const execution = await this.executionModel.findOne({ executionId });
    if (!execution) return null;

    for (let i = 0; i < execution.steps.length; i++) {
      const step = execution.steps[i];
      if (step.status !== 'pending') continue;

      // Check dependencies
      const dependenciesMet = step.dependsOn.every(depIndex => {
        const depStep = execution.steps[depIndex];
        return depStep?.status === 'completed' || depStep?.status === 'skipped';
      });

      if (dependenciesMet) {
        return { index: i, step };
      }
    }

    return null;
  }

  /**
   * Find executions that exceeded timeout
   */
  async findTimeoutExecutions(): Promise<Execution[]> {
    const now = new Date();
    return this.executionModel.find({
      status: 'running',
      timeoutAt: { $lte: now }
    });
  }

  /**
   * Cancel execution and all pending steps
   */
  async cancelExecution(executionId: string, reason: string): Promise<Execution> {
    const execution = await this.executionModel.findOne({ executionId });
    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    execution.status = 'cancelled';
    execution.completedAt = new Date();
    execution.error = {
      code: 'EXECUTION_CANCELLED',
      message: reason
    };

    // Cancel all pending/running steps
    execution.steps.forEach(step => {
      if (step.status === 'pending' || step.status === 'running') {
        step.status = 'skipped';
      }
    });

    await execution.save();
    return execution;
  }
}
```

---

### 2. ExecutionOrchestrator (Event-Driven Execution)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { NodeGateway } from '../node/node.gateway';
import { DeploymentService } from '../deployment/deployment.service';
import { NotiQueue } from '../noti/noti.queue';

@Injectable()
export class ExecutionOrchestrator {
  private readonly logger = new Logger(ExecutionOrchestrator.name);

  constructor(
    private readonly executionService: ExecutionService,
    private readonly nodeGateway: NodeGateway,
    private readonly deploymentService: DeploymentService,
    private readonly notiQueue: NotiQueue
  ) {}

  /**
   * Start execution
   */
  async executeExecution(executionId: string): Promise<void> {
    const execution = await this.executionService.findOneByField('executionId', executionId);
    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    if (execution.status !== 'pending') {
      throw new BadRequestException(`Execution ${executionId} is not in pending state`);
    }

    // Update execution status to running
    await this.executionService.updateByField('executionId', executionId, {
      status: 'running',
      startedAt: new Date()
    });

    this.logger.log(`Execution ${executionId} started`);

    // Execute first step(s) that have no dependencies
    await this.executeNextSteps(executionId);
  }

  /**
   * Execute next available steps (parallel if possible)
   */
  private async executeNextSteps(executionId: string): Promise<void> {
    const execution = await this.executionService.findOneByField('executionId', executionId);
    if (!execution || execution.status !== 'running') return;

    // Find all pending steps with dependencies met
    const executableSteps: { index: number; step: ExecutionStep }[] = [];

    for (let i = 0; i < execution.steps.length; i++) {
      const step = execution.steps[i];
      if (step.status !== 'pending') continue;

      const dependenciesMet = step.dependsOn.every(depIndex => {
        const depStep = execution.steps[depIndex];
        return depStep?.status === 'completed' || depStep?.status === 'skipped';
      });

      if (dependenciesMet) {
        executableSteps.push({ index: i, step });
      }
    }

    if (executableSteps.length === 0) {
      this.logger.log(`No executable steps for execution ${executionId}`);
      return;
    }

    // Execute all executable steps in parallel
    await Promise.all(
      executableSteps.map(({ index, step }) =>
        this.executeStep(executionId, index, step)
      )
    );
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    executionId: string,
    stepIndex: number,
    step: ExecutionStep
  ): Promise<void> {
    this.logger.log(`Executing step ${stepIndex} of execution ${executionId}`);

    // Update step status
    await this.executionService.updateStepStatus(executionId, stepIndex, {
      status: 'running',
      startedAt: new Date()
    });

    // Send WebSocket command to node
    const messageId = generateUUID();
    const command = {
      ...step.command,
      messageId,
      timestamp: new Date().toISOString(),
      data: {
        ...step.command.data,
        executionId,
        stepIndex
      }
    };

    try {
      await this.nodeGateway.sendCommandToNode(step.nodeId, command);

      // Update step with sent message ID
      await this.executionService.updateStepStatus(executionId, stepIndex, {
        sentMessageId: messageId
      });

      this.logger.log(`Command sent to node ${step.nodeId} for step ${stepIndex}`);
    } catch (error) {
      this.logger.error(`Failed to send command for step ${stepIndex}: ${error.message}`);

      await this.executionService.updateStepStatus(executionId, stepIndex, {
        status: 'failed',
        error: {
          code: 'COMMAND_SEND_FAILED',
          message: error.message
        }
      });

      // Trigger failure handling
      await this.handleExecutionFailure(executionId);
    }
  }

  /**
   * Handle step completion event from node
   */
  async handleStepCompletion(
    executionId: string,
    stepIndex: number,
    result: any,
    messageId: string
  ): Promise<void> {
    this.logger.log(`Step ${stepIndex} of execution ${executionId} completed`);

    // Update step
    await this.executionService.updateStepStatus(executionId, stepIndex, {
      status: 'completed',
      progress: 100,
      result,
      receivedMessageId: messageId
    });

    // Check if execution is completed
    const execution = await this.executionService.findOneByField('executionId', executionId);
    if (execution.status === 'completed') {
      await this.handleExecutionCompletion(executionId);
      return;
    }

    // Execute next steps
    await this.executeNextSteps(executionId);
  }

  /**
   * Handle step failure event from node
   */
  async handleStepFailure(
    executionId: string,
    stepIndex: number,
    error: any,
    messageId: string
  ): Promise<void> {
    this.logger.error(`Step ${stepIndex} of execution ${executionId} failed: ${error.message}`);

    // Update step
    await this.executionService.updateStepStatus(executionId, stepIndex, {
      status: 'failed',
      error,
      receivedMessageId: messageId
    });

    const execution = await this.executionService.findOneByField('executionId', executionId);

    // Check if step is optional
    const step = execution.steps[stepIndex];
    if (step.optional) {
      this.logger.log(`Step ${stepIndex} is optional, continuing execution`);
      await this.executeNextSteps(executionId);
      return;
    }

    // Handle execution failure
    await this.handleExecutionFailure(executionId);
  }

  /**
   * Handle execution completion
   */
  private async handleExecutionCompletion(executionId: string): Promise<void> {
    const execution = await this.executionService.findOneByField('executionId', executionId);
    this.logger.log(`Execution ${executionId} completed successfully`);

    // Update related resource (e.g., Deployment)
    if (execution.resourceType === 'deployment' && execution.resourceId) {
      await this.deploymentService.updateByField('deploymentId', execution.resourceId, {
        status: 'running',
        isRunning: true
      });
    }

    // Notify user
    await this.notiQueue.add('service.event', {
      event: 'service.event',
      data: {
        name: 'execution.completed',
        data: {
          executionId: execution.executionId,
          name: execution.name,
          category: execution.category,
          resourceType: execution.resourceType,
          resourceId: execution.resourceId,
          duration: (execution.completedAt.getTime() - execution.startedAt.getTime()) / 1000
        },
        recipients: {
          userIds: [execution.createdBy],
          orgIds: [execution.owner]
        }
      }
    });
  }

  /**
   * Handle execution failure
   */
  private async handleExecutionFailure(executionId: string): Promise<void> {
    const execution = await this.executionService.findOneByField('executionId', executionId);
    this.logger.error(`Execution ${executionId} failed`);

    // Check if can retry
    if (execution.retryCount < execution.maxRetries) {
      this.logger.log(`Retrying execution ${executionId} (attempt ${execution.retryCount + 1}/${execution.maxRetries})`);

      await this.executionService.updateByField('executionId', executionId, {
        $inc: { retryCount: 1 },
        $push: { retryAttempts: new Date() }
      });

      // Reset failed steps to pending
      const updatedSteps = execution.steps.map(st => ({
        ...st,
        status: st.status === 'failed' ? 'pending' : st.status,
        error: st.status === 'failed' ? undefined : st.error
      }));

      await this.executionService.updateByField('executionId', executionId, {
        status: 'running',
        steps: updatedSteps
      });

      // Retry execution
      await this.executeNextSteps(executionId);
      return;
    }

    // Max retries exceeded - mark as failed
    await this.executionService.updateByField('executionId', executionId, {
      status: 'failed',
      completedAt: new Date()
    });

    // Update related resource
    if (execution.resourceType === 'deployment' && execution.resourceId) {
      await this.deploymentService.updateByField('deploymentId', execution.resourceId, {
        status: 'failed',
        isRunning: false
      });
    }

    // Notify user
    await this.notiQueue.add('service.alert', {
      event: 'service.alert',
      data: {
        name: 'execution.failed',
        severity: 'error',
        data: {
          executionId: execution.executionId,
          name: execution.name,
          error: execution.error,
          retryCount: execution.retryCount
        },
        recipients: {
          userIds: [execution.createdBy],
          orgIds: [execution.owner]
        }
      }
    });
  }
}
```

---

### 3. Timeout Monitor (Scheduled Job)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExecutionService } from './execution.service';
import { ExecutionOrchestrator } from './execution.orchestrator';

@Injectable()
export class ExecutionTimeoutMonitor {
  private readonly logger = new Logger(ExecutionTimeoutMonitor.name);

  constructor(
    private readonly executionService: ExecutionService,
    private readonly executionOrchestrator: ExecutionOrchestrator
  ) {}

  /**
   * Check for timeout executions every 30 seconds
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkTimeoutExecutions(): Promise<void> {
    const timeoutExecutions = await this.executionService.findTimeoutExecutions();

    if (timeoutExecutions.length === 0) return;

    this.logger.warn(`Found ${timeoutExecutions.length} timeout executions`);

    for (const execution of timeoutExecutions) {
      try {
        // Update execution status
        await this.executionService.updateByField('executionId', execution.executionId, {
          status: 'timeout',
          completedAt: new Date(),
          error: {
            code: 'EXECUTION_TIMEOUT',
            message: `Execution exceeded timeout of ${execution.timeoutSeconds} seconds`
          }
        });

        this.logger.error(`Execution ${execution.executionId} timed out`);

        // Trigger failure handling (may retry)
        await this.executionOrchestrator['handleExecutionFailure'](execution.executionId);
      } catch (error) {
        this.logger.error(`Error handling timeout for execution ${execution.executionId}: ${error.message}`);
      }
    }
  }
}
```

---

### 4. NodeGateway Integration (Handle Execution Events)

```typescript
@WebSocketGateway({
  namespace: '/ws/node',
  cors: { origin: '*' }
})
export class NodeGateway implements OnGatewayConnection, OnGatewayDisconnect {

  // ... existing connection/authentication code ...

  @SubscribeMessage('command.result')
  async handleCommandResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: any
  ): Promise<void> {
    const nodeId = this.socketNodeMap.get(client.id);
    this.logger.log(`Received command.result from node ${nodeId}`);

    const { data, status } = message;

    // Extract execution info
    const { executionId, stepIndex, ...result } = data;

    if (!executionId || stepIndex === undefined) {
      this.logger.warn('Received command.result without executionId or stepIndex');
      return;
    }

    // Handle based on status
    if (status === 'success') {
      await this.executionOrchestrator.handleStepCompletion(
        executionId,
        stepIndex,
        result,
        message.messageId
      );
    } else {
      await this.executionOrchestrator.handleStepFailure(
        executionId,
        stepIndex,
        {
          code: data.error?.code || 'UNKNOWN_ERROR',
          message: data.error?.message || 'Unknown error',
          details: data.error?.details
        },
        message.messageId
      );
    }
  }

  /**
   * Send command to specific node
   */
  async sendCommandToNode(nodeId: string, command: any): Promise<void> {
    const socketId = this.nodeSocketMap.get(nodeId);
    if (!socketId) {
      throw new Error(`Node ${nodeId} is not connected`);
    }

    const socket = this.server.sockets.sockets.get(socketId);
    if (!socket) {
      throw new Error(`Socket for node ${nodeId} not found`);
    }

    socket.emit('message', command);
    this.logger.log(`Sent command ${command.type} to node ${nodeId}`);
  }
}
```

---

## 📊 Example Execution Records

### Simple Execution (No Steps)

```json
{
  "executionId": "exec-simple-001",
  "name": "Download Whisper Model",
  "category": "model",
  "type": "download-model",
  "status": "completed",
  "progress": 100,
  "resourceType": "model",
  "resourceId": "whisper-v3",
  "nodeId": "gpu-node-01",
  "timeoutSeconds": 300,
  "startedAt": "2025-11-13T10:00:00Z",
  "completedAt": "2025-11-13T10:04:30Z",
  "result": {
    "modelPath": "/models/whisper-v3",
    "sizeBytes": 5500000000
  }
}
```

### Complex Execution (With Steps)

```json
{
  "executionId": "exec-complex-001",
  "name": "Deploy Whisper ASR API",
  "category": "deployment",
  "type": "deploy-model",
  "status": "completed",
  "progress": 100,
  "resourceType": "deployment",
  "resourceId": "deploy-abc123",
  "involvedNodeIds": ["gpu-node-01", "proxy-node-01"],
  "timeoutSeconds": 600,
  "startedAt": "2025-11-13T10:00:00Z",
  "completedAt": "2025-11-13T10:09:30Z",
  "steps": [
    {
      "index": 0,
      "name": "Download model",
      "status": "completed",
      "progress": 100,
      "nodeId": "gpu-node-01",
      "timeoutSeconds": 300,
      "startedAt": "2025-11-13T10:00:00Z",
      "completedAt": "2025-11-13T10:04:30Z",
      "command": {
        "type": "model.download",
        "resource": { "type": "model", "id": "whisper-v3" }
      },
      "result": {
        "modelPath": "/models/whisper-v3",
        "sizeBytes": 5500000000
      },
      "dependsOn": []
    },
    {
      "index": 1,
      "name": "Start inference container",
      "status": "completed",
      "progress": 100,
      "nodeId": "gpu-node-01",
      "timeoutSeconds": 120,
      "startedAt": "2025-11-13T10:04:31Z",
      "completedAt": "2025-11-13T10:06:45Z",
      "command": {
        "type": "deployment.create",
        "resource": { "type": "deployment", "id": "deploy-abc123" }
      },
      "result": {
        "containerId": "container-triton-001",
        "endpoint": "http://192.168.1.100:8000",
        "gpuDeviceId": "0"
      },
      "dependsOn": [0]
    },
    {
      "index": 2,
      "name": "Configure proxy route",
      "status": "completed",
      "progress": 100,
      "nodeId": "proxy-node-01",
      "timeoutSeconds": 30,
      "startedAt": "2025-11-13T10:06:46Z",
      "completedAt": "2025-11-13T10:07:10Z",
      "command": {
        "type": "proxy.configure",
        "resource": { "type": "proxy", "id": "proxy-whisper-v3" }
      },
      "result": {
        "proxyUrl": "https://api.domain/api/models/whisper-v3",
        "configId": "nginx-config-001"
      },
      "dependsOn": [1]
    }
  ],
  "result": {
    "deploymentId": "deploy-abc123",
    "endpoint": "https://api.domain/api/models/whisper-v3",
    "totalDuration": 570
  }
}
```

---

## 🎯 Benefits of This Design

### 1. **Simple & Transparent**
- All state in MongoDB (no Redis needed)
- Easy to query execution status and history
- Clear audit trail

### 2. **Event-Driven Native**
- Fits naturally with WebSocket architecture
- Real-time progress updates
- Async by design

### 3. **Flexible**
- Steps can run in parallel or sequentially (via `dependsOn`)
- Optional steps (can fail without failing entire execution)
- Extensible to any workflow pattern

### 4. **Robust**
- Timeout monitoring per execution and step
- Automatic retry with configurable max attempts
- Detailed error tracking

### 5. **Observable**
- Real-time progress tracking
- Message ID tracking for debugging
- Complete execution history

### 6. **Scalable**
- Parallel step execution
- Independent execution processing
- Indexed queries for performance

---

## 🔄 Comparison with BullMQ Approach

| Feature | BullMQ Orchestrator | Pure Event-Based (Execution Entity) |
|---------|---------------------|-------------------------------------|
| **Storage** | Redis (job state) + MongoDB (resources) | MongoDB only |
| **Complexity** | Higher (BullMQ + Worker processes) | Lower (event handlers) |
| **Job Queue Features** | Built-in (priority, delay, repeat) | Must implement manually |
| **Real-time Updates** | Via BullMQ events | Via WebSocket events directly |
| **Retry Logic** | Built-in with backoff | Must implement manually |
| **Dashboard** | Bull Board (ready-made) | Must build custom UI |
| **Debugging** | BullMQ UI + logs | MongoDB queries + logs |
| **Dependency Management** | Job chains/flows | Step `dependsOn` field |
| **Scalability** | Horizontal (multiple workers) | Event-driven (single process) |
| **State Consistency** | Redis + MongoDB sync | Single source (MongoDB) |
| **Best For** | Complex scheduling, high-volume jobs | Simple workflows, real-time tracking |

---

## ✅ Recommendation

**Use Pure Event-Based with Execution Entity** for AIWM Service because:

1. ✅ **Simpler Architecture** - No BullMQ dependency
2. ✅ **Single Source of Truth** - MongoDB only
3. ✅ **Real-Time by Design** - WebSocket events naturally fit
4. ✅ **Transparent State** - Easy to query and debug
5. ✅ **Sufficient for Use Case** - AIWM workflows are not complex enough to justify BullMQ

**When to Add BullMQ Later:**
- Need advanced scheduling (cron jobs, delayed tasks)
- High job volume (thousands per second)
- Need job prioritization with multiple queues
- Want ready-made monitoring dashboard

---

## 📚 Related Documents

- **WebSocket Protocol:** [AIWM-WEBSOCKET-PROTOCOL.md](./AIWM-WEBSOCKET-PROTOCOL.md)
- **Architecture:** [AIWM-ARCHITECTURE.md](./AIWM-ARCHITECTURE.md)
- **Implementation Plan:** [aiwm-plan.md](./aiwm-plan.md)

---

**Document Owner:** Development Team
**Review Cycle:** As needed during implementation
**Status:** Ready for implementation approval
