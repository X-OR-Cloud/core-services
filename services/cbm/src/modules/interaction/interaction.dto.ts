import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsDate,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@hydrabyte/base';

const INTERACTION_TYPES = ['call', 'email', 'meeting', 'note', 'other'] as const;

/**
 * DTO for creating a new interaction
 */
export class CreateInteractionDto {
  @ApiProperty({
    description: 'Contact ID (required)',
  })
  @IsString()
  contactId!: string;

  @ApiPropertyOptional({
    description: 'Company ID (optional)',
  })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiProperty({
    description: 'Interaction type',
    enum: INTERACTION_TYPES,
    example: 'call',
  })
  @IsEnum(INTERACTION_TYPES)
  type!: string;

  @ApiProperty({
    description: 'When the interaction happened',
    example: '2026-04-07T10:00:00.000Z',
    type: Date,
  })
  @IsDate()
  @Type(() => Date)
  date!: Date;

  @ApiProperty({
    description: 'Summary of the interaction',
    example: 'Discussed Q2 renewal contract terms',
    maxLength: 5000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  summary!: string;

  @ApiPropertyOptional({
    description: 'Outcome or next action',
    example: 'Send updated proposal by Friday',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  outcome?: string;

  @ApiPropertyOptional({
    description: 'Tags for categorization',
    example: ['renewal', 'priority'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Additional notes',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/**
 * DTO for updating an existing interaction
 */
export class UpdateInteractionDto {
  @ApiPropertyOptional({ enum: INTERACTION_TYPES })
  @IsOptional()
  @IsEnum(INTERACTION_TYPES)
  type?: string;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  date?: Date;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  summary?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  outcome?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  // contactId and companyId are immutable after creation
}

/**
 * DTO for querying interactions
 */
export class InteractionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search text — searches in summary, outcome, notes',
    example: 'renewal',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
