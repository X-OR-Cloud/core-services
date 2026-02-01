import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsObject,
  IsArray,
  Min,
  Max,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RetryConfigDto {
  @ApiPropertyOptional({ description: 'Maximum retry attempts', default: 3, minimum: 0, maximum: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  @ApiPropertyOptional({ description: 'Backoff delay in milliseconds', default: 5000, minimum: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  backoffMs?: number;

  @ApiPropertyOptional({ description: 'Backoff strategy', enum: ['fixed', 'exponential'], default: 'exponential' })
  @IsOptional()
  @IsEnum(['fixed', 'exponential'])
  backoffType?: string;
}

export class CreateScheduledJobDto {
  @ApiProperty({ description: 'Unique job name', example: 'daily-cleanup' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Job description', example: 'Clean up expired sessions daily' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Job tags for filtering', example: ['maintenance', 'daily'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ description: 'Cron expression for scheduling', example: '0 0 * * *' })
  @IsString()
  @IsNotEmpty()
  cronExpression: string;

  @ApiPropertyOptional({ description: 'Timezone for cron expression', example: 'Asia/Ho_Chi_Minh', default: 'Asia/Ho_Chi_Minh' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ description: 'Target queue name', example: 'aiwm.jobs' })
  @IsString()
  @IsNotEmpty()
  targetQueue: string;

  @ApiProperty({ description: 'Job payload - target service will parse and route', example: { jobType: 'maintenance', action: 'cleanup' } })
  @IsObject()
  payload: Record<string, any>;

  @ApiPropertyOptional({ description: 'Enable/disable job', default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Job priority (1-10, higher = more priority)', default: 5, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  priority?: number;

  @ApiPropertyOptional({ description: 'Job timeout in milliseconds', default: 300000, minimum: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  timeout?: number;

  @ApiPropertyOptional({ description: 'Retry configuration' })
  @IsOptional()
  @ValidateNested()
  @Type(() => RetryConfigDto)
  retryConfig?: RetryConfigDto;
}

export class UpdateScheduledJobDto extends PartialType(CreateScheduledJobDto) {}

export class TriggerJobResponseDto {
  @ApiProperty({ description: 'Execution ID' })
  executionId: string;

  @ApiProperty({ description: 'Job ID' })
  jobId: string;

  @ApiProperty({ description: 'Trigger status' })
  status: string;

  @ApiProperty({ description: 'Message' })
  message: string;
}

export class NextRunsQueryDto {
  @ApiPropertyOptional({ description: 'Number of next runs to preview', default: 5, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  @Type(() => Number)
  count?: number;
}

export class NextRunsResponseDto {
  @ApiProperty({ description: 'List of next scheduled run times' })
  nextRuns: Date[];
}
