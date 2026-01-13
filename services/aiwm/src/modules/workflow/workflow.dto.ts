import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * DTO for creating a new workflow
 */
export class CreateWorkflowDto {
  @ApiProperty({
    description: 'Workflow name',
    example: 'Content Generation Pipeline',
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    description: 'Workflow description',
    example: 'Multi-step LLM pipeline for generating structured articles',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Workflow version',
    example: 'v1.0',
    default: 'v1.0',
  })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional({
    description: 'Workflow status',
    enum: ['draft', 'active', 'archived'],
    example: 'draft',
    default: 'draft',
  })
  @IsOptional()
  @IsEnum(['draft', 'active', 'archived'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Execution mode',
    enum: ['internal', 'langgraph'],
    example: 'internal',
    default: 'internal',
  })
  @IsOptional()
  @IsEnum(['internal', 'langgraph'])
  executionMode?: string;
}

/**
 * DTO for updating an existing workflow
 * All fields are optional
 */
export class UpdateWorkflowDto extends PartialType(CreateWorkflowDto) {}
