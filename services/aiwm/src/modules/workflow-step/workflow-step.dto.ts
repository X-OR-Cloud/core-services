import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  IsNumber,
  IsArray,
  MinLength,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * LLM Configuration DTO
 */
export class LLMConfigDto {
  @ApiProperty({
    description: 'Deployment ID reference',
    example: 'deployment_gpt4_prod',
  })
  @IsString()
  deploymentId!: string;

  @ApiProperty({
    description: 'System prompt for LLM',
    example: 'You are an expert content strategist.',
    maxLength: 5000,
  })
  @IsString()
  @MaxLength(5000)
  systemPrompt!: string;

  @ApiPropertyOptional({
    description: 'User prompt template (Handlebars syntax)',
    example: 'Topic: {{topic}}\nTarget audience: {{audience}}',
  })
  @IsOptional()
  @IsString()
  userPromptTemplate?: string;

  @ApiPropertyOptional({
    description: 'LLM parameters',
    example: { temperature: 0.7, max_tokens: 500 },
  })
  @IsOptional()
  @IsObject()
  parameters?: {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
  };

  @ApiPropertyOptional({
    description: 'Step timeout in milliseconds',
    example: 30000,
    default: 30000,
  })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  timeout?: number;
}

/**
 * DTO for creating a new workflow step
 */
export class CreateWorkflowStepDto {
  @ApiProperty({
    description: 'Workflow ID this step belongs to',
    example: '6789abcd1234567890abcdef',
  })
  @IsString()
  workflowId!: string;

  @ApiProperty({
    description: 'Step name',
    example: 'Generate Outline',
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    description: 'Step description',
    example: 'Create structured article outline',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Display order index (can duplicate for parallel steps)',
    example: 0,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  orderIndex!: number;

  @ApiProperty({
    description: 'Step type',
    enum: ['llm'],
    example: 'llm',
    default: 'llm',
  })
  @IsEnum(['llm'])
  type!: string;

  @ApiProperty({
    description: 'LLM configuration',
    type: LLMConfigDto,
  })
  @ValidateNested()
  @Type(() => LLMConfigDto)
  llmConfig!: LLMConfigDto;

  @ApiPropertyOptional({
    description: 'Input validation schema (JSON Schema)',
    example: {
      type: 'object',
      properties: {
        topic: { type: 'string', minLength: 1 },
        audience: { type: 'string' },
      },
      required: ['topic'],
    },
  })
  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Output validation schema (JSON Schema)',
    example: {
      type: 'object',
      properties: {
        outline: { type: 'string' },
        sections: { type: 'array' },
      },
    },
  })
  @IsOptional()
  @IsObject()
  outputSchema?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Dependency step IDs (WorkflowStep._id references, empty array for first step)',
    example: ['6789abcd1234567890abcdef'],
    default: [],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];

  @ApiPropertyOptional({
    description: 'Error handling configuration',
    example: {
      maxRetries: 2,
      retryDelayMs: 5000,
      continueOnError: false,
    },
  })
  @IsOptional()
  @IsObject()
  errorHandling?: {
    maxRetries?: number;
    retryDelayMs?: number;
    continueOnError?: boolean;
  };
}

/**
 * DTO for updating an existing workflow step
 * All fields are optional except workflowId
 */
export class UpdateWorkflowStepDto extends PartialType(
  CreateWorkflowStepDto
) {}
