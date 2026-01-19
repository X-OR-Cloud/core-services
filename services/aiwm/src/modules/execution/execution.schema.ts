import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ExecutionDocument = Execution & Document;
export type ExecutionStepDocument = ExecutionStep & Document;

/**
 * ExecutionType - Discriminator for execution types
 */
export enum ExecutionType {
  DEPLOYMENT = 'deployment',
  WORKFLOW = 'workflow',
}

/**
 * ExecutionErrorType - Classification of execution errors
 */
export enum ExecutionErrorType {
  VALIDATION_ERROR = 'validation_error',
  EXECUTION_ERROR = 'execution_error',
  TIMEOUT_ERROR = 'timeout_error',
  DEPENDENCY_ERROR = 'dependency_error',
  CONFIGURATION_ERROR = 'configuration_error',
  SYSTEM_ERROR = 'system_error',
}

/**
 * ExecutionStep - Embedded subdocument
 * Represents a single step in an execution workflow
 */
@Schema({ _id: false, timestamps: false })
export class ExecutionStep {
  @Prop({ required: true })
  index!: number; // 0, 1, 2, ... (execution order)

  @Prop({ required: true })
  name!: string; // e.g., 'Download model', 'Start container'

  @Prop()
  description?: string;

  @Prop({
    required: true,
    enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
    default: 'pending',
  })
  status!: string;

  @Prop({ default: 0, min: 0, max: 100 })
  progress!: number;

  // Step type: 'command' for deployment, 'llm' for workflow
  @Prop({ required: true, enum: ['command', 'llm'] })
  type!: string;

  // WebSocket command to execute (for deployment type)
  @Prop({ type: Object })
  command?: {
    type: string; // e.g., 'model.download', 'deployment.create'
    resource: {
      type: string;
      id: string;
    };
    data: Record<string, any>;
  };

  // LLM configuration (for workflow type)
  @Prop({ type: Object })
  llmConfig?: {
    deploymentId: string;
    systemPrompt: string;
    userPromptTemplate?: string;
    parameters?: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
    };
  };

  // Input/output for workflow steps
  @Prop({ type: Object })
  input?: any;

  @Prop({ type: Object })
  output?: any;

  // Workflow step reference (for workflow executions)
  @Prop()
  workflowStepId?: string; // WorkflowStep._id reference for analytics/reporting

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
  dependsOn!: number[]; // Indexes of steps that must complete first (deployment)

  @Prop({ type: [Number], default: [] })
  dependencies!: number[]; // Indexes of steps that must complete first (workflow)

  @Prop({ default: false })
  optional!: boolean; // Can be skipped if failed

  // Error handling configuration (for workflow steps)
  @Prop({ type: Object })
  errorHandling?: {
    maxRetries?: number;
    retryDelayMs?: number;
    continueOnError?: boolean;
  };
}

export const ExecutionStepSchema = SchemaFactory.createForClass(ExecutionStep);

/**
 * Execution - Main entity for workflow orchestration
 * Tracks multi-step execution workflows using pure event-based approach
 */
@Schema({ timestamps: true })
export class Execution extends BaseSchema {
  @Prop({ required: true })
  name!: string; // Human-readable execution name

  @Prop()
  description?: string;

  // Execution type discriminator
  @Prop({
    required: true,
    enum: Object.values(ExecutionType),
  })
  type!: string; // 'deployment' or 'workflow'

  // Status tracking
  @Prop({
    required: true,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'timeout'],
    default: 'pending',
  })
  status!: string;

  @Prop({ default: 0, min: 0, max: 100 })
  progress!: number; // Percentage (0-100)

  // Parent-child relationship for composite executions
  @Prop({ type: Types.ObjectId, ref: 'Execution' })
  parentExecutionId?: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], default: [] })
  childExecutionIds!: Types.ObjectId[];

  // Steps (embedded documents)
  @Prop({ type: [ExecutionStepSchema], default: [] })
  steps!: ExecutionStep[];

  // Related resources (for deployment)
  @Prop()
  resourceType?: string; // 'deployment', 'model', 'node', 'agent'

  @Prop()
  resourceId?: string; // Foreign key to related resource

  // Workflow-specific fields
  @Prop()
  workflowId?: string;

  @Prop()
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

  @Prop({ type: Object })
  input?: any; // Initial input data for workflow

  // Node assignment
  @Prop({ type: String, ref: 'Node' })
  nodeId?: string; // Primary node executing this execution

  @Prop({ type: [String], default: [] })
  involvedNodeIds!: string[]; // All nodes involved in execution

  // Timing
  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ required: true })
  timeoutSeconds!: number; // Execution timeout in seconds

  @Prop()
  timeoutAt?: Date; // Calculated timeout deadline

  // Result and error tracking
  @Prop({ type: Object })
  result?: {
    success: boolean;
    summary?: {
      stepsCompleted: number;
      stepsFailed: number;
      stepsSkipped: number;
      totalTokensUsed?: number;
      totalCost?: number;
      totalDurationMs: number;
    };
    finalOutput?: any; // For workflow executions
    data?: Record<string, any>; // For deployment executions
  };

  @Prop({ type: Object })
  error?: {
    type?: ExecutionErrorType;
    code?: string;
    message: string;
    details?: {
      stepName?: string;
      inputValidationErrors?: any[];
      outputValidationErrors?: any[];
      llmError?: {
        statusCode?: number;
        responseBody?: string;
      };
      [key: string]: any;
    };
    nodeId?: string; // Which node caused the error
    stepIndex?: number; // Which step failed
    failedStepIndex?: number; // Alias for stepIndex (workflow)
    stack?: string;
    timestamp?: Date;
  };

  // WebSocket message tracking
  @Prop({ type: [String], default: [] })
  sentMessageIds!: string[]; // WebSocket messages sent for this execution

  @Prop({ type: [String], default: [] })
  receivedMessageIds!: string[]; // WebSocket messages received

  // Retry configuration
  @Prop({ default: 0 })
  retryCount!: number; // Number of retry attempts

  @Prop({ default: 3 })
  maxRetries!: number; // Maximum retry attempts

  @Prop({ type: [Date], default: [] })
  retryAttempts!: Date[]; // Timestamps of retry attempts

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, etc.
}

export const ExecutionSchema = SchemaFactory.createForClass(Execution);

// Indexes for performance
ExecutionSchema.index({ status: 1, createdAt: -1 });
ExecutionSchema.index({ type: 1, status: 1 }); // NEW: For filtering by execution type
ExecutionSchema.index({ workflowId: 1, status: 1 }); // NEW: For workflow executions
ExecutionSchema.index({ parentExecutionId: 1 });
ExecutionSchema.index({ resourceType: 1, resourceId: 1 });
ExecutionSchema.index({ nodeId: 1, status: 1 });
ExecutionSchema.index({ timeoutAt: 1 }, { sparse: true });
ExecutionSchema.index({ 'steps.status': 1 });
