/**
 * Zod schemas for AgentManagement tools
 */

import * as z from 'zod';

// Enums aligned with Agent schema
const AgentStatusEnum = z.enum(['inactive', 'idle', 'busy', 'suspended']);
const AgentTypeEnum = z.enum(['managed', 'autonomous']);
const AgentFrameworkEnum = z.enum(['claude-agent-sdk']);
const AgentRoleEnum = z.enum(['organization.editor', 'organization.viewer']);
const ChannelPlatformEnum = z.enum(['discord', 'telegram']);

/**
 * Channel config sub-schema (for CreateAgent / UpdateAgent)
 *
 * Each entry = 1 Discord channel or Telegram group.
 * For claude-agent-sdk agents, channels drive how the agent
 * listens for and responds to messages.
 */
const ChannelConfigSchema = z.object({
  platform: ChannelPlatformEnum.describe('Platform: discord or telegram'),
  label: z.string().optional().describe('Optional: Human-readable label, e.g. "Support Channel"'),
  enabled: z.boolean().describe('Whether this channel is active'),
  token: z.string().describe('Bot token for the platform'),
  botId: z
    .string()
    .optional()
    .describe('Optional: Discord bot user ID (numeric) or Telegram @botUsername — used to verify @mentions'),
  channelId: z
    .string()
    .describe('Discord: channel ID. Telegram: group ID (negative number as string). Use empty string "" if unknown yet.'),
  requireMentions: z
    .boolean()
    .describe('true = respond only when @mentioned. false = respond to all messages in the channel'),
  verboseLogging: z
    .boolean()
    .describe('true = emit step-by-step action logs to the channel. false = send only final results'),
  verboseLoggingTarget: z
    .string()
    .describe('"channel" = log to same channel, "thread" = Discord thread / reply chain, or a specific channel ID string'),
});

/**
 * Schema for listing agents
 */
export const ListAgentsSchema = z.object({
  page: z.number().int().positive().optional().default(1).describe('Optional: Page number (default: 1)'),
  limit: z.number().int().positive().max(100).optional().default(10).describe('Optional: Items per page (max 100, default: 10)'),
  name: z.string().optional().describe('Optional: Filter by agent name'),
  tags: z.string().optional().describe('Optional: Filter by tags (comma-separated)'),
  description: z.string().optional().describe('Optional: Filter by description (full-text search)'),
  status: AgentStatusEnum.optional().describe('Optional: Filter by status (inactive, idle, busy, suspended)'),
  type: AgentTypeEnum.optional().describe('Optional: Filter by type (managed, autonomous)'),
});

/**
 * Schema for creating an agent
 *
 * For claude-agent-sdk agents:
 * - settings.claude_model: which Claude model to use (e.g. "claude-3-5-sonnet-latest")
 * - settings.claude_maxTurns: max turns per session (default 100)
 * - settings.claude_permissionMode: "bypassPermissions" for managed agents
 * - settings.auth_roles: RBAC roles the agent acts with (e.g. ["agent", "document.editor"])
 * - channels[]: Discord/Telegram channel configs — each entry is one channel the agent listens on
 */
export const CreateAgentSchema = z.object({
  name: z.string().describe('Agent name'),
  description: z.string().describe('Agent description'),
  type: AgentTypeEnum.describe('managed = deployed to a node by the system; autonomous = user self-deploys'),
  framework: AgentFrameworkEnum.optional().default('claude-agent-sdk').describe('Agent runtime framework (default: claude-agent-sdk)'),
  instructionId: z.string().optional().describe('Optional: ID of the Instruction (system prompt) to assign'),
  guardrailId: z.string().optional().describe('Optional: ID of the Guardrail (content filter) to assign'),
  nodeId: z.string().optional().describe('Optional: Node ID where managed agent will be deployed'),
  role: AgentRoleEnum.optional().describe('Optional: RBAC role for MCP tool access (default: organization.viewer)'),
  tags: z.array(z.string()).optional().describe('Optional: Tags for categorization'),
  allowedToolIds: z.array(z.string()).optional().describe('Optional: Whitelist of MCP tool set IDs this agent can use'),
  allowedFunctions: z
    .array(z.string())
    .optional()
    .describe('Optional: Whitelist of runtime function names (e.g. ["Bash", "Read", "mcp__cbm__create_document"]). Empty = all allowed'),
  settings: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Optional: Runtime config. Supported keys: auth_roles (string[]), claude_model (string), claude_maxTurns (number), claude_permissionMode (string), claude_resume (boolean), claude_oauthToken (string)',
    ),
  channels: z
    .array(ChannelConfigSchema)
    .optional()
    .describe('Optional: Structured channel configs for Discord/Telegram. Each entry = one channel the agent listens on.'),
});

/**
 * Schema for updating an agent (all fields optional)
 */
export const UpdateAgentSchema = z.object({
  id: z.string().describe('Agent ID to update'),
  name: z.string().optional().describe('Optional: New agent name'),
  description: z.string().optional().describe('Optional: New description'),
  status: AgentStatusEnum.optional().describe('Optional: New status (inactive, idle, busy, suspended)'),
  instructionId: z.string().optional().describe('Optional: New instruction ID'),
  guardrailId: z.string().optional().describe('Optional: New guardrail ID'),
  nodeId: z.string().optional().describe('Optional: New node ID (managed agents only)'),
  role: AgentRoleEnum.optional().describe('Optional: New RBAC role'),
  tags: z.array(z.string()).optional().describe('Optional: New tags (replaces existing)'),
  allowedToolIds: z.array(z.string()).optional().describe('Optional: New allowed tool IDs (replaces existing)'),
  allowedFunctions: z.array(z.string()).optional().describe('Optional: New allowed function names (replaces existing)'),
  settings: z.record(z.string(), z.unknown()).optional().describe('Optional: Updated runtime settings'),
  channels: z
    .array(ChannelConfigSchema)
    .optional()
    .describe('Optional: Updated channel configs (replaces entire channels array)'),
});

/**
 * Schema for deleting an agent
 */
export const DeleteAgentSchema = z.object({
  id: z.string().describe('Agent ID to delete (soft delete)'),
});
