import { IsString, IsEnum, IsArray, IsOptional, IsObject, IsNotEmpty, IsBoolean, ValidateNested, ValidateIf, IsNumber, Min, Max, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Tool } from '../tool/tool.schema';
import { Instruction } from '../instruction/instruction.schema';
import { AgentConversationMode } from './agent.schema';

/** @deprecated Use ConnectionRouteDto in Connection module instead. Kept for backward compatibility. */
export class ChannelConfigDto {
  @ApiProperty({ enum: ['discord', 'telegram'] })
  @IsEnum(['discord', 'telegram'])
  platform!: 'discord' | 'telegram';

  @ApiPropertyOptional({ required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty()
  @IsString()
  token!: string;

  @ApiPropertyOptional({ required: false })
  @IsOptional()
  @IsString()
  botId?: string;

  @ApiProperty()
  @IsString()
  channelId!: string;

  @ApiProperty()
  @IsBoolean()
  requireMentions!: boolean;

  @ApiProperty()
  @IsBoolean()
  verboseLogging!: boolean;

  @ApiProperty()
  @IsString()
  verboseLoggingTarget!: string;
}

export class RagSettingsDto {
  @ApiPropertyOptional({ description: 'Number of chunks to retrieve per collection', example: 5, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  topK?: number;

  @ApiPropertyOptional({ description: 'Minimum similarity score (0-1) for chunk to be included', example: 0.7, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minScore?: number;
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
    description: 'Agent type: assistant = in-process agent run by AIWM agt mode (no env access), engineer = self-deployed or node-deployed agent with environment access',
    enum: ['assistant', 'engineer'],
    example: 'engineer',
    required: false
  })
  @IsOptional()
  @IsEnum(['assistant', 'engineer'])
  type?: string;

  @ApiPropertyOptional({
    description: 'Agent framework (determines runtime engine). Not used for assistant agents. pi-agent-sdk requires a running deployment.',
    enum: ['claude-agent-sdk', 'vercel-ai-sdk', 'pi-agent-sdk'],
    example: 'claude-agent-sdk',
    required: false
  })
  @IsOptional()
  @ValidateIf((o) => o.type !== 'assistant')
  @IsEnum(['claude-agent-sdk', 'vercel-ai-sdk', 'pi-agent-sdk'])
  framework?: string;

  @ApiPropertyOptional({ description: 'Instruction ID (optional)', required: false })
  @IsOptional()
  @IsString()
  instructionId?: string;

  @ApiPropertyOptional({ description: 'Guardrail ID (optional)', required: false })
  @IsOptional()
  @IsString()
  guardrailId?: string;

  @ApiPropertyOptional({
    description: 'Deployment ID (required for assistant agents and pi-agent-sdk framework, must be status=running)',
    required: false
  })
  @ValidateIf((o) => o.type === 'assistant' || o.framework === 'pi-agent-sdk')
  @IsNotEmpty()
  @IsString()
  deploymentId?: string;

  @ApiPropertyOptional({ description: 'Node ID where agent runs (engineer agents with nodeId are system-managed via node WebSocket)', required: false })
  @IsString()
  @IsOptional()
  nodeId?: string;

  @ApiPropertyOptional({ description: 'Agent tags', required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'RBAC role for agent to access MCP tools. Setting organization.owner requires the caller to have organization.owner or universe.owner role.',
    enum: ['organization.owner', 'organization.editor', 'organization.viewer'],
    required: false
  })
  @IsOptional()
  @IsEnum(['organization.owner', 'organization.editor', 'organization.viewer'])
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

  @ApiPropertyOptional({ description: 'Enable RAG: inject knowledge context into messages before LLM call', required: false })
  @IsOptional()
  @IsBoolean()
  ragEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Knowledge Collection IDs (from CBM) to search for RAG context', required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ragCollectionIds?: string[];

  @ApiPropertyOptional({ description: 'RAG retrieval settings', required: false, type: RagSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RagSettingsDto)
  ragSettings?: RagSettingsDto;

  @ApiPropertyOptional({
    description: 'Conversation scoping mode for anonymous WS clients and Connection Worker users. Authenticated WS users select conversation manually and are not affected.',
    enum: ['per-user', 'per-session', 'shared'],
    default: 'per-user',
    required: false,
  })
  @IsOptional()
  @IsEnum(['per-user', 'per-session', 'shared'])
  conversationMode?: AgentConversationMode;

  @ApiPropertyOptional({
    description: 'Session inactivity timeout in ms for per-session mode (default: 1800000 = 30 minutes)',
    required: false,
    example: 1800000,
  })
  @IsOptional()
  @IsNumber()
  @Min(60000)
  sessionTimeoutMs?: number;

  /** @deprecated Use Connection module. Kept for backward compatibility. */
  @ApiPropertyOptional({ required: false, type: [ChannelConfigDto] })
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
    description: 'Agent type: assistant = in-process agent run by AIWM agt mode (no env access), engineer = self-deployed or node-deployed agent with environment access',
    enum: ['assistant', 'engineer'],
    required: false
  })
  @IsOptional()
  @IsEnum(['assistant', 'engineer'])
  type?: string;

  @ApiPropertyOptional({
    description: 'Agent framework (determines runtime engine). Not used for assistant agents. pi-agent-sdk requires a running deployment.',
    enum: ['claude-agent-sdk', 'vercel-ai-sdk', 'pi-agent-sdk'],
    required: false
  })
  @IsOptional()
  @ValidateIf((o) => o.type !== 'assistant')
  @IsEnum(['claude-agent-sdk', 'vercel-ai-sdk', 'pi-agent-sdk'])
  framework?: string;

  @ApiPropertyOptional({ description: 'Instruction ID', required: false })
  @IsOptional()
  @IsString()
  instructionId?: string;

  @ApiPropertyOptional({ description: 'Guardrail ID', required: false })
  @IsOptional()
  @IsString()
  guardrailId?: string;

  @ApiPropertyOptional({
    description: 'Deployment ID (required for assistant agents and pi-agent-sdk framework, must be status=running)',
    required: false
  })
  @ValidateIf((o) => o.type === 'assistant' || o.framework === 'pi-agent-sdk')
  @IsNotEmpty()
  @IsString()
  deploymentId?: string;

  @ApiPropertyOptional({ description: 'Node ID', required: false })
  @IsOptional()
  @IsString()
  nodeId?: string;

  @ApiPropertyOptional({
    description: 'RBAC role for agent to access MCP tools. Setting organization.owner requires the caller to have organization.owner or universe.owner role.',
    enum: ['organization.owner', 'organization.editor', 'organization.viewer'],
    required: false
  })
  @IsOptional()
  @IsEnum(['organization.owner', 'organization.editor', 'organization.viewer'])
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

  @ApiPropertyOptional({ description: 'Enable RAG: inject knowledge context into messages before LLM call', required: false })
  @IsOptional()
  @IsBoolean()
  ragEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Knowledge Collection IDs (from CBM) to search for RAG context', required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ragCollectionIds?: string[];

  @ApiPropertyOptional({ description: 'RAG retrieval settings', required: false, type: RagSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RagSettingsDto)
  ragSettings?: RagSettingsDto;

  @ApiPropertyOptional({
    description: 'Conversation scoping mode for anonymous WS clients and Connection Worker users. Authenticated WS users select conversation manually and are not affected.',
    enum: ['per-user', 'per-session', 'shared'],
    required: false,
  })
  @IsOptional()
  @IsEnum(['per-user', 'per-session', 'shared'])
  conversationMode?: AgentConversationMode;

  @ApiPropertyOptional({
    description: 'Session inactivity timeout in ms for per-session mode (default: 1800000 = 30 minutes)',
    required: false,
    example: 1800000,
  })
  @IsOptional()
  @IsNumber()
  @Min(60000)
  sessionTimeoutMs?: number;

  /** @deprecated Use Connection module. Kept for backward compatibility. */
  @ApiPropertyOptional({ required: false, type: [ChannelConfigDto] })
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

  @ApiPropertyOptional({ description: 'Agent version string', example: '1.2.3' })
  @IsOptional()
  @IsString()
  version?: string;
}

export class AgentConnectBodyDto {
  @ApiProperty({ description: 'Agent ID', example: '507f1f77bcf86cd799439011' })
  @IsNotEmpty()
  @IsString()
  id: string;

  @ApiProperty({ description: 'Agent secret for authentication', example: 'agent-secret-key-here' })
  @IsNotEmpty()
  @IsString()
  secret: string;

  @ApiPropertyOptional({ description: 'Agent version string', example: '1.2.3' })
  @IsOptional()
  @IsString()
  version?: string;
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
    enum: ['claude-agent-sdk', 'vercel-ai-sdk'],
    example: 'claude-agent-sdk'
  })
  framework: string | undefined;

  @ApiProperty({ description: 'Agent runtime settings/configuration' })
  settings: Record<string, unknown>;

  /** @deprecated Use Connection module. Kept for backward compatibility. */
  @ApiProperty({ description: 'Legacy channel configurations', type: [ChannelConfigDto] })
  channels: ChannelConfigDto[];

  @ApiPropertyOptional({
    description: 'Deployment configuration (for engineer agents only)',
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
    multimodal?: boolean; // Whether the model supports multimodal (image/file) input
  };

  @ApiProperty({ description: 'Whether RAG is enabled for this agent', example: false })
  ragEnabled: boolean;

  @ApiProperty({
    description: 'RAG collection configs to search for context',
    type: 'array',
    example: [{ collectionId: '507f1f77bcf86cd799439011', topK: 5, minScore: 0.7 }]
  })
  ragCollections: Array<{
    collectionId: string;
    topK: number;
    minScore: number;
  }>;

  @ApiProperty({ description: 'Agent code identifier', example: 'PM-BOT-01', required: false })
  agentCode?: string;

  @ApiPropertyOptional({ description: 'Browser automation API URL (PinchTab)', example: 'https://pinchtab.example.com', required: false })
  browserApiUrl?: string | null;

  @ApiPropertyOptional({ description: 'Browser automation API key (PinchTab)', required: false })
  browserApiKey?: string | null;
}

export class AgentSleepInfoDto {
  @ApiProperty({ description: 'Reason agent is sleeping', example: 'BrowserMcpServer timeout 3 consecutive times' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({ description: 'ISO timestamp when sleep started', example: '2026-03-27T07:30:00.000Z' })
  @IsDateString()
  since: string;

  @ApiPropertyOptional({ description: 'ISO timestamp when agent expects to wake, null = indefinite', example: '2026-03-27T08:30:00.000Z', nullable: true, required: false })
  @IsOptional()
  @IsDateString()
  until?: string | null;
}

/**
 * DTO for agent heartbeat
 */
export class AgentHeartbeatDto {
  @ApiProperty({
    description: 'Current agent status',
    enum: ['idle', 'busy', 'sleep'],
    example: 'idle'
  })
  @IsEnum(['idle', 'busy', 'sleep'])
  status: string;

  @ApiPropertyOptional({ description: 'Sleep info, required when status=sleep', required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentSleepInfoDto)
  sleep?: AgentSleepInfoDto;

  @ApiPropertyOptional({
    description: 'Whether agent has an active MCP session. If false, server will not assign Work.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  mcpConnected?: boolean;

  @ApiPropertyOptional({
    description: 'List of function/tool names currently available to the agent. Server uses this to verify agent has required tools before assigning Work. Omit to skip capability check (backward compatible).',
    example: ['mcp__Builtin__StartWork', 'mcp__Builtin__CompleteWork', 'mcp__Builtin__RequestReviewForWork'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  availableFunctions?: string[];

  @ApiPropertyOptional({ description: 'Optional metrics', required: false })
  @IsOptional()
  @IsObject()
  metrics?: Record<string, unknown>;
}

/**
 * DTO for admin-initiated sleep action (POST :id/sleep)
 */
export class AgentSleepActionDto {
  @ApiProperty({ description: 'Reason for putting agent to sleep', example: 'Maintenance window' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'ISO timestamp when agent should wake, null = indefinite', example: '2026-04-05T10:00:00.000Z', nullable: true, required: false })
  @IsOptional()
  @IsDateString()
  until?: string | null;
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

/**
 * Query DTO for previewing agent instruction with optional systemPrompt override
 */
export class PreviewInstructionQueryDto {
  @ApiPropertyOptional({
    description: 'Override systemPrompt for preview (does not modify the stored instruction). Note: use PATCH with dryRun=true for long prompts to avoid HTTP/2 URL length limits.',
    required: false,
  })
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @ApiPropertyOptional({
    description: 'View mode: "rendered" (default) returns fully injected systemPrompt; "raw" returns original stored systemPrompt without any injection.',
    enum: ['rendered', 'raw'],
    required: false,
  })
  @IsOptional()
  @IsEnum(['rendered', 'raw'])
  mode?: 'rendered' | 'raw';
}

/**
 * DTO for updating agent instruction's systemPrompt
 */
export class UpdateAgentInstructionDto {
  @ApiProperty({ description: 'New systemPrompt to save into the agent instruction' })
  @IsString()
  @IsNotEmpty()
  systemPrompt: string;

  @ApiPropertyOptional({
    description: 'Dry run mode: if true, does not save to DB and returns the fully rendered (injected) preview instead.',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

/**
 * DTO for generating anonymous chat token
 */
export class AnonymousTokenDto {
  @ApiPropertyOptional({
    description: 'Anonymous user ID (UUID). If not provided, server will generate one.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  anonymousId?: string;

  @ApiPropertyOptional({
    description: 'Token expiry in seconds. Default is 86400 (24h).',
    example: 86400,
  })
  @IsOptional()
  expiresIn?: number;
}

/**
 * Response DTO for anonymous token generation
 */
export class AnonymousTokenResponseDto {
  @ApiProperty({ description: 'JWT token for anonymous WebSocket connection' })
  token!: string;

  @ApiProperty({ description: 'Anonymous user ID (UUID)', example: '550e8400-e29b-41d4-a716-446655440000' })
  anonymousId!: string;

  @ApiProperty({ description: 'Token expiry in seconds', example: 86400 })
  expiresIn!: number;

  @ApiProperty({ description: 'Token expiry timestamp (ISO 8601)', example: '2026-03-13T10:00:00.000Z' })
  expiresAt!: string;

  @ApiProperty({ description: 'Token ID for management (list/revoke)', example: '550e8400-e29b-41d4-a716-446655440001' })
  tokenId!: string;
}

/**
 * Response DTO for a single anonymous token entry (list view, no JWT value)
 */
export class AnonymousTokenEntryDto {
  @ApiProperty({ description: 'Token ID', example: '550e8400-e29b-41d4-a716-446655440001' })
  tokenId!: string;

  @ApiProperty({ description: 'Token creation timestamp' })
  createdAt!: Date;

  @ApiPropertyOptional({ description: 'Last time this token was used to connect' })
  lastConnectedAt?: Date;

  @ApiProperty({ description: 'Token expiry timestamp' })
  expiresAt!: Date;

  @ApiPropertyOptional({ description: 'Revocation timestamp (null if active)' })
  revokedAt?: Date;

  @ApiProperty({ description: 'Whether the token is currently active', example: true })
  isActive!: boolean;
}

/**
 * Response DTO for listing anonymous tokens
 */
export class AnonymousTokenListResponseDto {
  @ApiProperty({ type: [AnonymousTokenEntryDto] })
  items!: AnonymousTokenEntryDto[];

  @ApiProperty({ description: 'Total number of tokens' })
  total!: number;
}

/**
 * DTO for adding an external signing key (partner ES256 public key)
 */
export class AddExternalSigningKeyDto {
  @ApiProperty({
    description: 'Unique key identifier (kid). Used in JWT header for key lookup.',
    example: 'key-001',
  })
  @IsString()
  @IsNotEmpty()
  keyId: string;

  @ApiProperty({
    description: 'EC public key in PEM format (EC P-256, for ES256)',
    example: '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYFK4EEAAoDQgAE...\n-----END PUBLIC KEY-----',
  })
  @IsString()
  @IsNotEmpty()
  publicKey: string;

  @ApiPropertyOptional({
    description: 'Human-readable label for this key',
    example: 'Production Key Jan 2026',
  })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({
    description: 'Key expiry (ISO 8601). If omitted, key never expires.',
    example: '2027-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

/**
 * Response DTO for a single external signing key entry
 */
export class ExternalSigningKeyEntryDto {
  @ApiProperty({ description: 'Key ID', example: 'key-001' })
  keyId: string;

  @ApiProperty({ description: 'Algorithm', example: 'ES256' })
  algorithm: string;

  @ApiPropertyOptional({ description: 'Human-readable label' })
  label?: string;

  @ApiProperty({ description: 'Key creation timestamp' })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'Key expiry timestamp (null = no expiry)' })
  expiresAt?: Date;

  @ApiPropertyOptional({ description: 'Revocation timestamp (null if active)' })
  revokedAt?: Date;

  @ApiProperty({ description: 'Whether this key is currently active', example: true })
  isActive: boolean;
}

/**
 * Response DTO for listing external signing keys
 */
export class ExternalSigningKeyListResponseDto {
  @ApiProperty({ type: [ExternalSigningKeyEntryDto] })
  items: ExternalSigningKeyEntryDto[];

  @ApiProperty({ description: 'Total number of keys' })
  total: number;
}

/**
 * DTO for adding a debug log entry to an agent
 */
export class AddAgentLogDto {
  @ApiPropertyOptional({ enum: ['info', 'warn', 'error'], default: 'info', description: 'Log severity level' })
  @IsOptional()
  @IsEnum(['info', 'warn', 'error'])
  level?: 'info' | 'warn' | 'error';

  @ApiProperty({ description: 'Log message', example: 'Agent started task execution' })
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiPropertyOptional({ description: 'Additional structured data', example: { taskId: 'abc123', step: 1 } })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}

/**
 * Single log entry response
 */
export class AgentLogEntryDto {
  @ApiProperty({ enum: ['info', 'warn', 'error'], description: 'Log severity level' })
  level!: 'info' | 'warn' | 'error';

  @ApiProperty({ description: 'Log message' })
  message!: string;

  @ApiProperty({ description: 'Log timestamp' })
  time!: Date;

  @ApiPropertyOptional({ description: 'Additional structured data' })
  data?: Record<string, any>;
}

/**
 * Response DTO for agent logs
 */
export class AgentLogsResponseDto {
  @ApiProperty({ type: [AgentLogEntryDto] })
  logs!: AgentLogEntryDto[];
}
