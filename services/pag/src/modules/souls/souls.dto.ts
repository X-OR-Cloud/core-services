import { IsString, IsEnum, IsArray, IsNumber, IsBoolean, IsOptional, IsObject, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class SoulLlmDto {
  @ApiProperty({ 
    description: 'LLM provider',
    enum: ['gemini', 'openai', 'anthropic'],
    example: 'gemini'
  })
  @IsEnum(['gemini', 'openai', 'anthropic'])
  provider: string;

  @ApiProperty({ description: 'Model name', example: 'gemini-2.0-flash' })
  @IsString()
  model: string;

  @ApiProperty({ description: 'Temperature (0-1)', example: 0.7, minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  temperature: number;

  @ApiProperty({ description: 'Max tokens', example: 2048 })
  @IsNumber()
  @Min(1)
  maxTokens: number;

  @ApiPropertyOptional({ description: 'API key reference' })
  @IsOptional()
  @IsString()
  apiKeyRef?: string;
}

export class SoulPronounsDto {
  @ApiProperty({ description: 'How soul refers to itself', example: 'em', default: 'em' })
  @IsString()
  self: string;

  @ApiProperty({ description: 'How soul refers to user', example: 'anh/chị', default: 'anh/chị' })
  @IsString()
  user: string;
}

export class SoulPersonaDto {
  @ApiProperty({ description: 'System prompt', example: 'Bạn là TranGPT, một trợ lý AI thông minh và thân thiện.' })
  @IsString()
  systemPrompt: string;

  @ApiPropertyOptional({ description: 'Greeting message when user follows' })
  @IsOptional()
  @IsString()
  greeting?: string;

  @ApiProperty({ 
    description: 'Conversation tone',
    enum: ['friendly', 'professional', 'casual'],
    default: 'friendly'
  })
  @IsEnum(['friendly', 'professional', 'casual'])
  tone: string;

  @ApiProperty({ description: 'Pronouns configuration' })
  @IsObject()
  @ValidateNested()
  @Type(() => SoulPronounsDto)
  pronouns: SoulPronounsDto;
}

export class SoulMemoryDto {
  @ApiProperty({ description: 'Enable memory functionality', default: true })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'Max history messages to load as context', default: 50 })
  @IsNumber()
  @Min(1)
  maxHistoryMessages: number;

  @ApiProperty({ description: 'Number of messages after which to summarize', default: 100 })
  @IsNumber()
  @Min(1)
  summaryAfter: number;

  @ApiProperty({ description: 'Auto-extract facts from conversations', default: true })
  @IsBoolean()
  autoExtract: boolean;
}

export class SoulToolDto {
  @ApiProperty({ description: 'Tool name', example: 'weather' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Tool enabled status', default: true })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ description: 'Tool configuration' })
  @IsOptional()
  @IsObject()
  config?: object;
}

export class SoulQueueDto {
  @ApiPropertyOptional({ description: 'Queue name', example: 'pag:soul:transgpt' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Queue concurrency', default: 3 })
  @IsNumber()
  @Min(1)
  concurrency: number;

  @ApiProperty({ description: 'Timeout in milliseconds', default: 30000 })
  @IsNumber()
  @Min(1000)
  timeoutMs: number;
}

export class CreateSoulDto {
  @ApiProperty({ description: 'Soul name', example: 'TranGPT' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Soul slug (unique)', example: 'transgpt' })
  @IsString()
  slug: string;

  @ApiProperty({ 
    description: 'Soul status',
    enum: ['active', 'paused', 'disabled'],
    default: 'active'
  })
  @IsEnum(['active', 'paused', 'disabled'])
  status: string;

  @ApiPropertyOptional({ description: 'Channel IDs this soul serves' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channelIds?: string[];

  @ApiProperty({ description: 'LLM configuration' })
  @IsObject()
  @ValidateNested()
  @Type(() => SoulLlmDto)
  llm: SoulLlmDto;

  @ApiProperty({ description: 'Persona configuration' })
  @IsObject()
  @ValidateNested()
  @Type(() => SoulPersonaDto)
  persona: SoulPersonaDto;

  @ApiProperty({ description: 'Memory configuration' })
  @IsObject()
  @ValidateNested()
  @Type(() => SoulMemoryDto)
  memory: SoulMemoryDto;

  @ApiPropertyOptional({ description: 'Available tools' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SoulToolDto)
  tools?: SoulToolDto[];

  @ApiProperty({ description: 'Queue configuration' })
  @IsObject()
  @ValidateNested()
  @Type(() => SoulQueueDto)
  queue: SoulQueueDto;
}

export class UpdateSoulDto extends PartialType(CreateSoulDto) {}

export class SoulResponseDto extends CreateSoulDto {
  @ApiProperty({ description: 'Unique soul ID' })
  _id: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}