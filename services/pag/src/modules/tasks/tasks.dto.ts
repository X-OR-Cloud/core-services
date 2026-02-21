import { IsString, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({ description: 'Conversation ID' })
  @IsString()
  conversationId: string;

  @ApiProperty({ description: 'Soul ID' })
  @IsString()
  soulId: string;

  @ApiProperty({ description: 'Platform user ID' })
  @IsString()
  platformUserId: string;

  @ApiProperty({ description: 'Channel ID' })
  @IsString()
  channelId: string;

  @ApiProperty({ description: 'Task title', example: 'Họp team lúc 3h chiều' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Task description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['reminder', 'todo'], default: 'reminder' })
  @IsEnum(['reminder', 'todo'])
  type: string;

  @ApiPropertyOptional({ description: 'Due date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ description: 'Remind at (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  remindAt?: string;

  @ApiPropertyOptional({ enum: ['user_request', 'auto_extraction'], default: 'user_request' })
  @IsOptional()
  @IsEnum(['user_request', 'auto_extraction'])
  source?: string;

  @ApiPropertyOptional({ description: 'Original message text' })
  @IsOptional()
  @IsString()
  rawMessage?: string;
}

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @ApiPropertyOptional({ enum: ['pending', 'done', 'cancelled', 'overdue', 'snoozed'] })
  @IsOptional()
  @IsEnum(['pending', 'done', 'cancelled', 'overdue', 'snoozed'])
  status?: string;
}
