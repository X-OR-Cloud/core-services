import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReminderDto {
  @ApiProperty({ description: 'Actionable reminder content', example: 'Check npm install log at /tmp/npm.log. If done, run build.' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: 'When to trigger (null = next heartbeat)', example: '2026-03-12T10:00:00Z' })
  @IsOptional()
  @IsDateString()
  triggerAt?: string;
}

export class UpdateReminderDto {
  @ApiPropertyOptional({ description: 'Updated reminder content' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: 'Updated trigger time' })
  @IsOptional()
  @IsDateString()
  triggerAt?: string;
}

export class ListRemindersDto {
  @ApiPropertyOptional({ description: 'Filter by status', enum: ['pending', 'done', 'all'], default: 'pending' })
  @IsOptional()
  @IsEnum(['pending', 'done', 'all'])
  status?: 'pending' | 'done' | 'all';
}
