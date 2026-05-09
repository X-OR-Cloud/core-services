import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsObject,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditResult, AuditKeyType } from './audit-log.schema';

/**
 * Audit event input (what the lib sends; what the internal POST /audit-logs/internal accepts).
 */
export class AuditActorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ description: "Org ID or 'system' for cron/internal events" })
  @IsString()
  orgId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class CreateAuditLogDto {
  @ApiProperty({ description: 'Service that emitted the event', example: 'iam' })
  @IsString()
  service!: string;

  @ApiProperty({ description: 'Entity type acted upon', example: 'user' })
  @IsString()
  resource!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resourceId?: string;

  @ApiProperty({ description: 'Verb', example: 'create' })
  @IsString()
  action!: string;

  @ApiPropertyOptional({ enum: ['setting', 'sensitive_setting'] })
  @IsOptional()
  @IsEnum(['setting', 'sensitive_setting'])
  keyType?: AuditKeyType;

  @ApiProperty({ type: AuditActorDto })
  @ValidateNested()
  @Type(() => AuditActorDto)
  actor!: AuditActorDto;

  @ApiPropertyOptional({ description: 'Sanitized + truncated by lib before send' })
  @IsOptional()
  @IsObject()
  before?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  after?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  requestPayload?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  responseSummary?: Record<string, unknown>;

  @ApiProperty({ enum: ['success', 'failure'] })
  @IsEnum(['success', 'failure'])
  result!: AuditResult;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  errorCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  correlationId?: string;

  @ApiProperty({ description: 'When the event occurred (ISO 8601)' })
  @IsDateString()
  occurredAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  durationMs?: number;
}

export class CreateAuditLogBatchDto {
  @ApiProperty({ type: [CreateAuditLogDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAuditLogDto)
  events!: CreateAuditLogDto[];
}

/**
 * Search query for UI list/filter.
 */
export class AuditLogQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  service?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(['success', 'failure'])
  result?: AuditResult;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  correlationId?: string;

  @ApiPropertyOptional({ description: 'ISO 8601' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO 8601' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
