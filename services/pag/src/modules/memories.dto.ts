import { IsString, IsEnum, IsNumber, IsOptional, IsDateString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateMemoryDto {
  @ApiProperty({ description: 'Conversation ID' })
  @IsString()
  conversationId: string;

  @ApiProperty({ description: 'Soul ID' })
  @IsString()
  soulId: string;

  @ApiProperty({ description: 'Platform user ID' })
  @IsString()
  platformUserId: string;

  @ApiProperty({ 
    description: 'Memory type',
    enum: ['fact', 'preference', 'schedule', 'note'],
    example: 'fact'
  })
  @IsEnum(['fact', 'preference', 'schedule', 'note'])
  type: string;

  @ApiProperty({ description: 'Memory key', example: 'favorite_food' })
  @IsString()
  key: string;

  @ApiProperty({ description: 'Memory value', example: 'Pizza and sushi' })
  @IsString()
  value: string;

  @ApiProperty({ 
    description: 'Source of memory',
    enum: ['extracted', 'user_told', 'bot_inferred'],
    example: 'extracted'
  })
  @IsEnum(['extracted', 'user_told', 'bot_inferred'])
  source: string;

  @ApiPropertyOptional({ description: 'Confidence score (0-1)', example: 0.85, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({ description: 'Memory expiration date' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateMemoryDto extends PartialType(CreateMemoryDto) {}

export class MemoryResponseDto extends CreateMemoryDto {
  @ApiProperty({ description: 'Unique memory ID' })
  _id: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

export class MemoryQueryDto {
  @ApiPropertyOptional({ description: 'Filter by platform user ID' })
  @IsOptional()
  @IsString()
  platformUserId?: string;

  @ApiPropertyOptional({ description: 'Filter by soul ID' })
  @IsOptional()
  @IsString()
  soulId?: string;

  @ApiPropertyOptional({ description: 'Filter by memory type' })
  @IsOptional()
  @IsEnum(['fact', 'preference', 'schedule', 'note'])
  type?: string;

  @ApiPropertyOptional({ description: 'Filter by memory key' })
  @IsOptional()
  @IsString()
  key?: string;

  @ApiPropertyOptional({ description: 'Minimum confidence score' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minConfidence?: number;
}

export class UpsertMemoryDto {
  @ApiProperty({ description: 'Platform user ID' })
  @IsString()
  platformUserId: string;

  @ApiProperty({ description: 'Soul ID' })
  @IsString()
  soulId: string;

  @ApiProperty({ description: 'Memory key' })
  @IsString()
  key: string;

  @ApiProperty({ description: 'Memory value' })
  @IsString()
  value: string;

  @ApiPropertyOptional({ description: 'Memory type', default: 'fact' })
  @IsOptional()
  @IsEnum(['fact', 'preference', 'schedule', 'note'])
  type?: string;

  @ApiPropertyOptional({ description: 'Source', default: 'extracted' })
  @IsOptional()
  @IsEnum(['extracted', 'user_told', 'bot_inferred'])
  source?: string;

  @ApiPropertyOptional({ description: 'Confidence score' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({ description: 'Expiration date' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}