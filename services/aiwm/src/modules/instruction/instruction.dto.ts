import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * DTO for creating a new instruction
 * MongoDB _id will be used as the primary identifier
 */
export class CreateInstructionDto {
  @ApiProperty({
    description: 'Human-readable name for the instruction',
    example: 'Customer Support Agent v1',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the instruction',
    example: 'Instructions for customer support AI agent',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    description: 'Main system prompt for the agent',
    example:
      'You are a helpful customer support agent. Always be polite, professional, and empathetic.',
  })
  @IsString()
  @MinLength(10)
  systemPrompt!: string;

  @ApiPropertyOptional({
    description: 'Tags for categorizing instructions',
    example: ['customer-service', 'support', 'polite'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Instruction status',
    enum: ['active', 'inactive'],
    example: 'active',
    default: 'active',
  })
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

/**
 * DTO for updating an existing instruction
 * All fields are optional
 */
export class UpdateInstructionDto {
  @ApiPropertyOptional({
    description: 'Human-readable name for the instruction',
    example: 'Customer Support Agent v2',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the instruction',
    example: 'Updated instructions for customer support AI agent',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Main system prompt for the agent',
    example: 'Updated system prompt...',
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  systemPrompt?: string;

  @ApiPropertyOptional({
    description: 'Tags for categorizing instructions',
    example: ['customer-service', 'support', 'empathetic'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Instruction status',
    enum: ['active', 'inactive'],
    example: 'active',
  })
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}
