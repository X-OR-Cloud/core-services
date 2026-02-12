import { IsString, IsEnum, IsArray, IsNumber, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class MessagePlatformDto {
  @ApiProperty({ description: 'Platform message ID', example: 'zalo_msg_12345' })
  @IsString()
  id: string;

  @ApiProperty({ 
    description: 'Message type',
    enum: ['text', 'image', 'file', 'sticker', 'location'],
    example: 'text'
  })
  @IsEnum(['text', 'image', 'file', 'sticker', 'location'])
  type: string;

  @ApiProperty({ description: 'Raw platform payload' })
  @IsObject()
  raw: object;
}

export class MessageLlmDto {
  @ApiProperty({ description: 'LLM provider', example: 'gemini' })
  @IsString()
  provider: string;

  @ApiProperty({ description: 'Model used', example: 'gemini-2.0-flash' })
  @IsString()
  model: string;

  @ApiProperty({ description: 'Prompt tokens used' })
  @IsNumber()
  promptTokens: number;

  @ApiProperty({ description: 'Completion tokens generated' })
  @IsNumber()
  completionTokens: number;

  @ApiProperty({ description: 'Response latency in milliseconds' })
  @IsNumber()
  latencyMs: number;
}

export class MessageToolCallDto {
  @ApiProperty({ description: 'Tool name', example: 'weather' })
  @IsString()
  tool: string;

  @ApiProperty({ description: 'Tool input parameters' })
  @IsObject()
  input: object;

  @ApiProperty({ description: 'Tool output result' })
  @IsObject()
  output: object;
}

export class CreateMessageDto {
  @ApiProperty({ description: 'Conversation ID' })
  @IsString()
  conversationId: string;

  @ApiProperty({ 
    description: 'Message role',
    enum: ['user', 'assistant', 'system'],
    example: 'user'
  })
  @IsEnum(['user', 'assistant', 'system'])
  role: string;

  @ApiProperty({ description: 'Message content', example: 'Hello, how are you?' })
  @IsString()
  content: string;

  @ApiProperty({ description: 'Platform message data' })
  @IsObject()
  @ValidateNested()
  @Type(() => MessagePlatformDto)
  platformMessage: MessagePlatformDto;

  @ApiPropertyOptional({ description: 'LLM processing info (for assistant messages)' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MessageLlmDto)
  llm?: MessageLlmDto;

  @ApiPropertyOptional({ description: 'Tool calls made during processing' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageToolCallDto)
  toolCalls?: MessageToolCallDto[];
}

export class UpdateMessageDto extends PartialType(CreateMessageDto) {}

export class MessageResponseDto extends CreateMessageDto {
  @ApiProperty({ description: 'Unique message ID' })
  _id: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

export class MessageQueryDto {
  @ApiPropertyOptional({ description: 'Filter by conversation ID' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({ description: 'Filter by role' })
  @IsOptional()
  @IsEnum(['user', 'assistant', 'system'])
  role?: string;

  @ApiPropertyOptional({ description: 'Limit number of messages' })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({ description: 'Page number' })
  @IsOptional()
  @IsNumber()
  page?: number;
}