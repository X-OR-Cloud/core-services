import { IsString, IsEnum, IsArray, IsOptional, IsObject, IsNotEmpty, IsBoolean, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Tool } from '../tool/tool.schema';
import { Instruction } from '../instruction/instruction.schema';

/**
 * DTO for a single channel configuration entry.
 * Each entry represents one Discord channel or Telegram group.
 */
export class ChannelConfigDto {
  @ApiProperty({ description: 'Platform', enum: ['discord', 'telegram'] })
  @IsEnum(['discord', 'telegram'])
  platform: 'discord' | 'telegram';

  @ApiPropertyOptional({ description: 'Human-readable label, e.g. "VTV Support Discord"', required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ description: 'Enable or disable this channel', example: true })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'Bot token for the platform' })
  @IsString()
  token: string;

  @ApiPropertyOptional({
    description: 'Discord: bot user ID (numeric string). Telegram: @botUsername. Used to verify mentions.',
    required: false
  })
  @IsOptional()
  @IsString()
  botId?: string;

  @ApiProperty({
    description: 'Discord: channel ID. Telegram: group ID (negative number as string).',
    example: '987654321012345678'
  })
  @IsString()
  channelId: string;

  @ApiProperty({ description: 'Only respond when the bot is @mentioned', example: false })
  @IsBoolean()
  requireMentions: boolean;

  @ApiProperty({ description: 'Emit step-by-step action logs to the channel', example: false })
  @IsBoolean()
  verboseLogging: boolean;

  @ApiProperty({
    description: 'Where to send verbose logs: "channel" (same channel), "thread" (Discord thread / reply chain), or a specific channel ID',
    example: 'channel'
  })
  @IsString()
  verboseLoggingTarget: string;
}

/**
 * DTO for creating a new agent - MVP Minimal Version
 */
export class CreateAgentDto {
  @ApiProperty({ description: 'Agent name', example: 'Customer Support Agent' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Agent description', example: 'AI agent for customer support' })
  @IsString()
  description: string;

  @ApiPropertyOptional({
    description: 'Agent status (defaults to inactive, set by system)',
    enum: ['inactive', 'idle', 'busy', 'suspended'],
    example: 'inactive',
    required: false
  })
  @IsOptional()
  @IsEnum(['inactive', 'idle', 'busy', 'suspended'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Agent type: managed = system-managed (deployed to node, has secret), autonomous = user-controlled (via UI, uses user JWT)',
    enum: ['managed', 'autonomous'],
    example: 'autonomous',
    required: false
  })
  @IsOptional()
  @IsEnum(['managed', 'autonomous'])
  type?: string;

  @ApiPropertyOptional({
    description: 'Agent framework (determines runtime engine)',
    enum: ['claude-agent-sdk'],
    example: 'claude-agent-sdk',
    required: false
  })
  @IsOptional()
  @IsEnum(['claude-agent-sdk'])
  framework?: string;

  @ApiPropertyOptional({ description: 'Instruction ID (optional)', required: false })
  @IsOptional()
  @IsString()
  instructionId?: string;

  @ApiPropertyOptional({ description: 'Guardrail ID (optional)', required: false })
  @IsOptional()
  @IsString()
  guardrailId?: string;

  @ApiPropertyOptional({ description: 'Node ID where agent runs (required for managed agents)', required: false })
  @IsString()
  @IsOptional()
  nodeId?: string;

  @ApiPropertyOptional({ description: 'Agent tags', required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'RBAC role for agent to access MCP tools',
    enum: ['organization.editor', 'organization.viewer'],
    required: false
  })
  @IsOptional()
  @IsEnum(['organization.editor', 'organization.viewer'])
  role?: string;

  @ApiPropertyOptional({ description: 'Secret for agent authentication (will be hashed)', required: false })
  @IsOptional()
  @IsString()
  secret?: string;

  @ApiPropertyOptional({ description: 'Allowed tool IDs - MCP tool sets (whitelist)', required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedToolIds?: string[];

  @ApiPropertyOptional({
    description: 'Allowed runtime function names agent can call. Empty = all allowed.',
    required: false,
    type: [String],
    example: ['Bash', 'Read', 'Write', 'mcp__cbm__create_document']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedFunctions?: string[];

  @ApiPropertyOptional({
    description: 'Runtime configuration with flat structure using prefixes (auth_, claude_). discord_* and telegram_* keys are deprecated — use channels[] instead.',
    required: false,
    example: {
      auth_roles: ['agent'],
      claude_model: 'claude-3-5-sonnet-latest',
      claude_maxTurns: 100,
      claude_permissionMode: 'bypassPermissions',
    }
  })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Structured channel configurations (Discord / Telegram). Each entry = one channel with its own token, behavior flags, and logging config.',
    required: false,
    type: [ChannelConfigDto]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChannelConfigDto)
  channels?: ChannelConfigDto[];
}

/**
 * DTO for updating an existing agent - MVP Minimal Version
 */
export class UpdateAgentDto {
  @ApiPropertyOptional({ description: 'Agent name', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Agent description', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Agent status',
    enum: ['inactive', 'idle', 'busy', 'suspended'],
    required: false
  })
  @IsOptional()
  @IsEnum(['inactive', 'idle', 'busy', 'suspended'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Agent type: managed = system-managed (deployed to node), autonomous = user-controlled (via UI)',
    enum: ['managed', 'autonomous'],
    required: false
  })
  @IsOptional()
  @IsEnum(['managed', 'autonomous'])
  type?: string;

  @ApiPropertyOptional({
    description: 'Agent framework (determines runtime engine)',
    enum: ['claude-agent-sdk'],
    required: false
  })
  @IsOptional()
  @IsEnum(['claude-agent-sdk'])
  framework?: string;

  @ApiPropertyOptional({ description: 'Instruction ID', required: false })
  @IsOptional()
  @IsString()
  instructionId?: string;

  @ApiPropertyOptional({ description: 'Guardrail ID', required: false })
  @IsOptional()
  @IsString()
  guardrailId?: string;

  @ApiPropertyOptional({ description: 'Deployment ID (for autonomous agents)', required: false })
  @IsOptional()
  @IsString()
  deploymentId?: string;

  @ApiPropertyOptional({ description: 'Node ID', required: false })
  @IsOptional()
  @IsString()
  nodeId?: string;

  @ApiPropertyOptional({
    description: 'RBAC role for agent to access MCP tools',
    enum: ['organization.editor', 'organization.viewer'],
    required: false
  })
  @IsOptional()
  @IsEnum(['organization.editor', 'organization.viewer'])
  role?: string;

  @ApiPropertyOptional({ description: 'Agent tags', required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Allowed tool IDs - MCP tool sets (whitelist)', required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedToolIds?: string[];

  @ApiPropertyOptional({
    description: 'Allowed runtime function names agent can call. Empty = all allowed.',
    required: false,
    type: [String],
    example: ['Bash', 'Read', 'Write', 'mcp__cbm__create_document']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedFunctions?: string[];

  @ApiPropertyOptional({
    description: 'Runtime configuration with flat structure using prefixes (auth_, claude_). discord_* and telegram_* keys are deprecated — use channels[] instead.',
    required: false,
    example: {
      auth_roles: ['agent'],
      claude_model: 'claude-3-5-sonnet-latest',
      claude_maxTurns: 100,
      claude_permissionMode: 'bypassPermissions',
    }
  })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Structured channel configurations (Discord / Telegram). Each entry = one channel with its own token, behavior flags, and logging config.',
    required: false,
    type: [ChannelConfigDto]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChannelConfigDto)
  channels?: ChannelConfigDto[];
}

/**
 * DTO for agent connection/authentication
 */
export class AgentConnectDto {
  @ApiProperty({ description: 'Agent secret for authentication', example: 'agent-secret-key-here' })
  @IsNotEmpty()
  @IsString()
  secret: string;
}

/**
 * Response DTO for agent connection
 * Matches IAM TokenData structure with agent-specific additions
 */
export class AgentConnectResponseDto {
  @ApiProperty({ description: 'Agent ID', example: '507f1f77bcf86cd799439011' })
  id: string;

  @ApiProperty({ description: 'Agent Name', example: 'My Agent' })
  name: string;

  @ApiProperty({ description: 'JWT access token (contains agentId, username, roles, orgId)', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ description: 'Token expiration time in seconds', example: 86400 })
  expiresIn: number;

  @ApiProperty({ description: 'Refresh token (not implemented for agents)', example: null, nullable: true })
  refreshToken: string | null;

  @ApiProperty({ description: 'Refresh token expiration in seconds', example: 0 })
  refreshExpiresIn: number;

  @ApiProperty({ description: 'Token type', example: 'bearer' })
  tokenType: string;

  @ApiProperty({
    description: 'MCP server configurations (HTTP transport format)',
    example: {
      'cbm-tools': {
        type: 'http',
        url: 'http://localhost:3305/mcp',
        headers: { Authorization: 'Bearer ...' }
      }
    }
  })
  mcpServers: Record<string, {
    type: string;
    url: string;
    headers: Record<string, string>;
  }>;

  @ApiProperty({
    description: 'Instruction object for agent',
    example: {
      id: '507f1f77bcf86cd799439011',
      systemPrompt: 'You are a helpful customer support agent...',
    }
  })
  instruction: {
    id: string;
    systemPrompt: string;
  };

  @ApiProperty({ description: 'Allowed tools for this agent', type: [Object] })
  tools: Tool[];

  @ApiProperty({ description: 'Allowed runtime function names. Empty = all allowed.', type: [String], example: ['Bash', 'Read'] })
  allowedFunctions: string[];

  @ApiProperty({
    description: 'Agent framework (determines runtime engine)',
    enum: ['claude-agent-sdk'],
    example: 'claude-agent-sdk'
  })
  framework: string | undefined;

  @ApiProperty({ description: 'Agent runtime settings/configuration' })
  settings: Record<string, unknown>;

  @ApiProperty({ description: 'Structured channel configurations for Discord/Telegram', type: [ChannelConfigDto] })
  channels: ChannelConfigDto[];

  @ApiPropertyOptional({
    description: 'Deployment configuration (for autonomous agents only)',
    required: false,
    example: {
      id: '507f1f77bcf86cd799439011',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      baseAPIEndpoint: 'https://api.x-or.cloud/deployments/507f1f77bcf86cd799439011/inference',
      apiEndpoint: 'https://api.anthropic.com/v1/messages'
    }
  })
  deployment?: {
    id: string;
    provider: string;
    model: string;
    baseAPIEndpoint: string; // Base proxy endpoint: .../deployments/{id}/inference
    apiEndpoint: string; // Provider-specific endpoint with path
  };
}

/**
 * DTO for agent heartbeat
 */
export class AgentHeartbeatDto {
  @ApiProperty({
    description: 'Current agent status',
    enum: ['idle', 'busy'],
    example: 'idle'
  })
  @IsEnum(['idle', 'busy'])
  status: string;

  @ApiPropertyOptional({ description: 'Optional metrics', required: false })
  @IsOptional()
  @IsObject()
  metrics?: Record<string, unknown>;
}

/**
 * DTO for system task returned in heartbeat response
 */
export class AgentSystemTaskDto {
  @ApiProperty({
    description: 'Type of system task',
    enum: ['work', 'inbox', 'alert'],
    example: 'work'
  })
  type!: 'work' | 'inbox' | 'alert';

  @ApiPropertyOptional({ description: 'Task ID (e.g. work item ID)', example: '507f1f77bcf86cd799439011' })
  id?: string;

  @ApiPropertyOptional({ description: 'Task title', example: 'Implement login feature' })
  title?: string;
}

/**
 * Response DTO for credentials regeneration
 */
export class AgentCredentialsResponseDto {
  @ApiProperty({ description: 'Agent ID' })
  agentId: string;

  @ApiProperty({ description: 'Plain text secret (show only once)' })
  secret: string;

  @ApiProperty({ description: 'Pre-formatted .env configuration snippet' })
  envConfig: string;

  @ApiProperty({ description: 'Installation script (placeholder/sample)' })
  installScript: string;
}

/**
 * DTO for agent disconnect
 */
export class AgentDisconnectDto {
  @ApiPropertyOptional({ description: 'Reason for disconnection', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
