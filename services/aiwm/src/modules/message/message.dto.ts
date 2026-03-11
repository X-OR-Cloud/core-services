import { IsString, IsEnum, IsArray, IsOptional, IsBoolean, IsObject, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FunctionCall {
  @ApiProperty({ description: 'Function name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Function arguments' })
  @IsObject()
  arguments: Record<string, any>;
}

export class ToolCall {
  @ApiProperty({ description: 'Tool call ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Tool type' })
  @IsString()
  type: string;

  @ApiProperty({ description: 'Function definition' })
  @IsObject()
  function: {
    name: string;
    arguments: string;
  };
}

export class ToolResult {
  @ApiProperty({ description: 'Tool call ID' })
  @IsString()
  toolCallId: string;

  @ApiProperty({ description: 'Tool result' })
  @IsObject()
  result: any;
}

export class Usage {
  @ApiProperty({ description: 'Prompt tokens' })
  @IsOptional()
  @IsNumber()
  promptTokens?: number;

  @ApiProperty({ description: 'Completion tokens' })
  @IsOptional()
  @IsNumber()
  completionTokens?: number;

  @ApiProperty({ description: 'Total tokens' })
  @IsOptional()
  @IsNumber()
  totalTokens?: number;
}

export class CreateMessageDto {
  @ApiProperty({ description: 'Conversation ID' })
  @IsString()
  conversationId: string;

  @ApiProperty({ description: 'Agent ID' })
  @IsString()
  agentId: string;

  @ApiProperty({ description: 'Message role', enum: ['user', 'assistant', 'system'] })
  @IsEnum(['user', 'assistant', 'system'])
  role: string;

  @ApiProperty({ description: 'Message type', enum: ['text', 'thinking', 'tool_call', 'tool_result', 'error', 'system'], required: false })
  @IsOptional()
  @IsEnum(['text', 'thinking', 'tool_call', 'tool_result', 'error', 'system'])
  type?: string;

  @ApiProperty({ description: 'Message content' })
  @IsString()
  content: string;

  @ApiProperty({ description: 'Name of sender', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Function call', required: false })
  @IsOptional()
  @IsObject()
  functionCall?: FunctionCall;

  @ApiProperty({ description: 'Tool calls', required: false, type: [ToolCall] })
  @IsOptional()
  @IsArray()
  toolCalls?: ToolCall[];

  @ApiProperty({ description: 'Token usage', required: false, type: Usage })
  @IsOptional()
  @IsObject()
  usage?: Usage;

  @ApiProperty({ description: 'Response latency in ms', required: false })
  @IsOptional()
  @IsNumber()
  latency?: number;

  @ApiProperty({ description: 'Response time in ms', required: false })
  @IsOptional()
  @IsNumber()
  responseTime?: number;

  @ApiProperty({ description: 'Error message if failed', required: false })
  @IsOptional()
  @IsString()
  error?: string;

  @ApiProperty({ description: 'Additional metadata', required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateMessageDto {
  @ApiProperty({ description: 'Message content', required: false })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ description: 'Name of sender', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Function call', required: false })
  @IsOptional()
  @IsObject()
  functionCall?: FunctionCall;

  @ApiProperty({ description: 'Tool calls', required: false, type: [ToolCall] })
  @IsOptional()
  @IsArray()
  toolCalls?: ToolCall[];

  @ApiProperty({ description: 'Tool results', required: false, type: [ToolResult] })
  @IsOptional()
  @IsArray()
  toolResults?: ToolResult[];

  @ApiProperty({ description: 'Token usage', required: false, type: Usage })
  @IsOptional()
  @IsObject()
  usage?: Usage;

  @ApiProperty({ description: 'Response latency in ms', required: false })
  @IsOptional()
  @IsNumber()
  latency?: number;

  @ApiProperty({ description: 'Response time in ms', required: false })
  @IsOptional()
  @IsNumber()
  responseTime?: number;

  @ApiProperty({ description: 'Error message if failed', required: false })
  @IsOptional()
  @IsString()
  error?: string;

  @ApiProperty({ description: 'Additional metadata', required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiProperty({ description: 'Active status', required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}