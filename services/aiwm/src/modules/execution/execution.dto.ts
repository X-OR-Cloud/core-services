import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  IsObject,
  IsBoolean,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for ExecutionStep
 */
export class ExecutionStepDto {
  @ApiProperty({ description: 'Step index (execution order)', example: 0 })
  @IsNumber()
  @Min(0)
  index!: number;

  @ApiProperty({ description: 'Step name', example: 'Download model' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Step description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Command to execute via WebSocket',
    example: {
      type: 'model.download',
      resource: { type: 'model', id: 'whisper-v3' },
      data: { sourcePath: 'openai/whisper-large-v3', targetPath: '/models' },
    },
  })
  @IsObject()
  @IsOptional()
  command?: {
    type: string;
    resource: { type: string; id: string };
    data: Record<string, any>;
  };

  @ApiPropertyOptional({ description: 'Node ID to execute this step' })
  @IsString()
  @IsOptional()
  nodeId?: string;

  @ApiPropertyOptional({ description: 'Step timeout in seconds' })
  @IsNumber()
  @Min(1)
  @IsOptional()
  timeoutSeconds?: number;

  @ApiPropertyOptional({
    description: 'Dependencies (step indexes that must complete first)',
    example: [0, 1],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  dependsOn?: number[];

  @ApiPropertyOptional({ description: 'Whether this step is optional', default: false })
  @IsBoolean()
  @IsOptional()
  optional?: boolean;
}

/**
 * DTO for creating an execution
 */
export class CreateExecutionDto {
  @ApiProperty({ description: 'Execution name', example: 'Deploy Whisper ASR API' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Execution description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Execution steps',
    type: [ExecutionStepDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExecutionStepDto)
  steps!: ExecutionStepDto[];

  @ApiPropertyOptional({ description: 'Related resource type', example: 'deployment' })
  @IsString()
  @IsOptional()
  resourceType?: string;

  @ApiPropertyOptional({ description: 'Related resource ID', example: 'deploy-abc123' })
  @IsString()
  @IsOptional()
  resourceId?: string;

  @ApiPropertyOptional({ description: 'Primary node ID' })
  @IsString()
  @IsOptional()
  nodeId?: string;

  @ApiPropertyOptional({ description: 'All involved node IDs', example: ['node-01', 'node-02'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  involvedNodeIds?: string[];

  @ApiProperty({ description: 'Execution timeout in seconds', example: 600 })
  @IsNumber()
  @Min(1)
  timeoutSeconds!: number;

  @ApiPropertyOptional({ description: 'Maximum retry attempts', example: 3, default: 3 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  maxRetries?: number;

  @ApiPropertyOptional({ description: 'Additional metadata', example: {} })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * DTO for updating an execution
 */
export class UpdateExecutionDto {
  @ApiPropertyOptional({ description: 'Execution name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Execution description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Execution status',
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'timeout'],
  })
  @IsEnum(['pending', 'running', 'completed', 'failed', 'cancelled', 'timeout'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Progress percentage (0-100)', example: 50 })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  progress?: number;

  @ApiPropertyOptional({ description: 'Execution result data' })
  @IsObject()
  @IsOptional()
  result?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Error information' })
  @IsObject()
  @IsOptional()
  error?: {
    code: string;
    message: string;
    details?: any;
    nodeId?: string;
    stepIndex?: number;
  };

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * DTO for updating an execution step
 */
export class UpdateExecutionStepDto {
  @ApiPropertyOptional({
    description: 'Step status',
    enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
  })
  @IsEnum(['pending', 'running', 'completed', 'failed', 'skipped'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Step progress (0-100)', example: 75 })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  progress?: number;

  @ApiPropertyOptional({ description: 'Step result data' })
  @IsObject()
  @IsOptional()
  result?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Step error information' })
  @IsObject()
  @IsOptional()
  error?: {
    code: string;
    message: string;
    details?: any;
  };

  @ApiPropertyOptional({ description: 'Sent message ID' })
  @IsString()
  @IsOptional()
  sentMessageId?: string;

  @ApiPropertyOptional({ description: 'Received message ID' })
  @IsString()
  @IsOptional()
  receivedMessageId?: string;
}

/**
 * DTO for execution query/filter
 */
export class ExecutionQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by resource type' })
  @IsString()
  @IsOptional()
  resourceType?: string;

  @ApiPropertyOptional({ description: 'Filter by resource ID' })
  @IsString()
  @IsOptional()
  resourceId?: string;

  @ApiPropertyOptional({ description: 'Filter by node ID' })
  @IsString()
  @IsOptional()
  nodeId?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Page size', default: 20 })
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

/**
 * DTO for triggering execution start
 */
export class StartExecutionDto {
  @ApiPropertyOptional({ description: 'Force start even if already running', default: false })
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

/**
 * DTO for cancelling execution
 */
export class CancelExecutionDto {
  @ApiPropertyOptional({ description: 'Reason for cancellation' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'Force cancel (stop immediately)', default: false })
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

/**
 * DTO for retrying execution
 */
export class RetryExecutionDto {
  @ApiPropertyOptional({ description: 'Force retry even if max retries reached', default: false })
  @IsBoolean()
  @IsOptional()
  force?: boolean;

  @ApiPropertyOptional({ description: 'Reset all steps to pending', default: false })
  @IsBoolean()
  @IsOptional()
  resetSteps?: boolean;
}

/**
 * DTO for triggering workflow execution
 */
export class TriggerWorkflowDto {
  @ApiProperty({ description: 'Workflow input data', example: { topic: 'AI in Healthcare' } })
  @IsNotEmpty()
  input!: any;

  @ApiPropertyOptional({
    description: 'Execute synchronously (wait for completion)',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  sync?: boolean;

  @ApiPropertyOptional({
    description: 'Test specific step by WorkflowStep._id (requires sync=true)',
  })
  @IsString()
  @IsOptional()
  stepId?: string;
}
