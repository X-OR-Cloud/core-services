import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  Max,
  ValidateNested,
  ValidateIf,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Schema definition for tool input/output
 */
export class ToolSchemaDto {
  @ApiProperty({
    description: 'JSON Schema for tool input parameters',
    example: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  })
  @IsObject()
  inputSchema!: object;

  @ApiProperty({
    description: 'JSON Schema for tool output',
    example: {
      type: 'object',
      properties: {
        results: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @IsObject()
  outputSchema!: object;
}

/**
 * DTO for creating a new tool
 * MongoDB _id will be used as the primary identifier
 */
export class CreateToolDto {
  @ApiProperty({
    description: 'Tool name',
    example: 'webSearch',
    maxLength: 100,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: 'Tool type',
    enum: ['mcp', 'builtin', 'custom', 'api'],
    example: 'mcp',
  })
  @IsEnum(['mcp', 'builtin', 'custom', 'api'])
  type!: string;

  @ApiProperty({
    description: 'Tool description',
    example: 'Search the web using DuckDuckGo',
    maxLength: 500,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @ApiProperty({
    description: 'Tool category',
    enum: ['productivity', 'data', 'system', 'communication'],
    example: 'productivity',
  })
  @IsEnum(['productivity', 'data', 'system', 'communication'])
  category!: string;

  // MCP-specific fields (conditional validation based on type)
  @ApiPropertyOptional({
    description: 'Transport protocol (required if type=mcp)',
    enum: ['sse', 'http'],
    example: 'sse',
  })
  @ValidateIf((o) => o.type === 'mcp')
  @IsEnum(['sse', 'http'])
  transport?: string;

  @ApiPropertyOptional({
    description: 'Tool endpoint URL (required if type=mcp)',
    example: 'http://localhost:3100',
  })
  @ValidateIf((o) => o.type === 'mcp')
  @IsString()
  endpoint?: string;

  @ApiPropertyOptional({
    description: 'Docker image name (required if type=mcp)',
    example: 'aiops/mcp-web-search:latest',
  })
  @ValidateIf((o) => o.type === 'mcp')
  @IsString()
  dockerImage?: string;

  @ApiPropertyOptional({
    description: 'Container port (required if type=mcp)',
    example: 3100,
    minimum: 1024,
    maximum: 65535,
  })
  @ValidateIf((o) => o.type === 'mcp')
  @IsNumber()
  @Min(1024)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional({
    description: 'Environment variables for MCP container',
    example: { API_KEY: 'xxx', DEBUG: 'true' },
  })
  @IsOptional()
  @IsObject()
  environment?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Health check endpoint path',
    example: '/health',
  })
  @IsOptional()
  @IsString()
  healthEndpoint?: string;

  // Common fields
  @ApiProperty({
    description: 'Tool schema (input/output definitions)',
    type: ToolSchemaDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => ToolSchemaDto)
  schema!: ToolSchemaDto;

  @ApiPropertyOptional({
    description: 'Tool status',
    enum: ['active', 'inactive', 'error'],
    example: 'active',
    default: 'active',
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'error'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Access scope',
    enum: ['public', 'org', 'private'],
    example: 'public',
    default: 'public',
  })
  @IsOptional()
  @IsEnum(['public', 'org', 'private'])
  scope?: string;
}

/**
 * DTO for updating an existing tool
 * All fields are optional
 */
export class UpdateToolDto {
  @ApiPropertyOptional({
    description: 'Tool name',
    example: 'webSearchV2',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Tool description',
    example: 'Enhanced web search with filters',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Tool category',
    enum: ['productivity', 'data', 'system', 'communication'],
    example: 'productivity',
  })
  @IsOptional()
  @IsEnum(['productivity', 'data', 'system', 'communication'])
  category?: string;

  @ApiPropertyOptional({
    description: 'Tool endpoint URL',
    example: 'http://localhost:3101',
  })
  @IsOptional()
  @IsString()
  endpoint?: string;

  @ApiPropertyOptional({
    description: 'Container port',
    example: 3101,
    minimum: 1024,
    maximum: 65535,
  })
  @IsOptional()
  @IsNumber()
  @Min(1024)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional({
    description: 'Environment variables',
    example: { API_KEY: 'new-key' },
  })
  @IsOptional()
  @IsObject()
  environment?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Health check endpoint path',
    example: '/healthz',
  })
  @IsOptional()
  @IsString()
  healthEndpoint?: string;

  @ApiPropertyOptional({
    description: 'Tool schema (input/output definitions)',
    type: ToolSchemaDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ToolSchemaDto)
  schema?: ToolSchemaDto;

  @ApiPropertyOptional({
    description: 'Tool status',
    enum: ['active', 'inactive', 'error'],
    example: 'active',
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'error'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Access scope',
    enum: ['public', 'org', 'private'],
    example: 'org',
  })
  @IsOptional()
  @IsEnum(['public', 'org', 'private'])
  scope?: string;
}

/**
 * DTO for looking up available functions by agent framework and tool IDs
 */
export class LookupToolFunctionsDto {
  @ApiProperty({
    description: 'Agent framework identifier',
    enum: ['claude-agent-sdk'],
    example: 'claude-agent-sdk',
  })
  @IsString()
  @IsEnum(['claude-agent-sdk'])
  framework!: string;

  @ApiProperty({
    description: 'List of Tool document IDs to lookup functions for',
    example: ['6740a1b2c3d4e5f6a7b8c9d0'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(0)
  toolIds!: string[];
}

/**
 * Response item for tool functions lookup
 */
export class ToolFunctionsResponseDto {
  @ApiProperty({
    description: 'Tool category name',
    example: 'Framework',
  })
  tool!: string;

  @ApiProperty({
    description: 'List of available function names',
    example: ['Task', 'Bash', 'Read'],
    type: [String],
  })
  functions!: string[];
}
