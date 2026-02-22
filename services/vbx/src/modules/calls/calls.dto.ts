import { IsString, IsEnum, IsOptional, IsNumber, IsArray, IsDateString, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateCallDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  extensionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  callId?: string;

  @ApiProperty({ example: '84912205468' })
  @IsString()
  callerNumber: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  callerName?: string;

  @ApiProperty({ example: '842471083656' })
  @IsString()
  calledNumber: string;

  @ApiPropertyOptional({ enum: ['inbound', 'outbound'] })
  @IsOptional()
  @IsEnum(['inbound', 'outbound'])
  direction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  answeredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  duration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  talkDuration?: number;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  transcript?: { role: string; text: string; timestamp: Date }[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recordingUrl?: string;

  @ApiPropertyOptional({ enum: ['ringing', 'answered', 'missed', 'failed', 'busy', 'rejected'] })
  @IsOptional()
  @IsEnum(['ringing', 'answered', 'missed', 'failed', 'busy', 'rejected'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  llmProvider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  llmModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}

export class UpdateCallDto extends PartialType(CreateCallDto) {}
