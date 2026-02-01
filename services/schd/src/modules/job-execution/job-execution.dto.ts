import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ExecutionStatsQueryDto {
  @ApiPropertyOptional({ description: 'Job ID to filter stats' })
  @IsOptional()
  @IsString()
  jobId?: string;

  @ApiPropertyOptional({ description: 'Start date for stats period' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for stats period' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class ExecutionStatsResponseDto {
  @ApiProperty({ description: 'Total executions' })
  total: number;

  @ApiProperty({ description: 'Completed executions' })
  completed: number;

  @ApiProperty({ description: 'Failed executions' })
  failed: number;

  @ApiProperty({ description: 'Timed out executions' })
  timeout: number;

  @ApiProperty({ description: 'Currently running executions' })
  running: number;

  @ApiProperty({ description: 'Pending executions' })
  pending: number;

  @ApiProperty({ description: 'Queued executions' })
  queued: number;

  @ApiProperty({ description: 'Success rate percentage' })
  successRate: number;

  @ApiProperty({ description: 'Average duration in milliseconds' })
  avgDuration: number;
}

export class RetryExecutionResponseDto {
  @ApiProperty({ description: 'New execution ID' })
  executionId: string;

  @ApiProperty({ description: 'Original execution ID' })
  retryOf: string;

  @ApiProperty({ description: 'Retry count' })
  retryCount: number;

  @ApiProperty({ description: 'Status' })
  status: string;

  @ApiProperty({ description: 'Message' })
  message: string;
}

export class JobExecutionFilterDto {
  @ApiPropertyOptional({ description: 'Filter by job ID' })
  @IsOptional()
  @IsString()
  jobId?: string;

  @ApiPropertyOptional({ description: 'Filter by status', enum: ['pending', 'queued', 'running', 'completed', 'failed', 'timeout'] })
  @IsOptional()
  @IsEnum(['pending', 'queued', 'running', 'completed', 'failed', 'timeout'])
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by trigger type', enum: ['scheduler', 'manual'] })
  @IsOptional()
  @IsEnum(['scheduler', 'manual'])
  triggeredBy?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
