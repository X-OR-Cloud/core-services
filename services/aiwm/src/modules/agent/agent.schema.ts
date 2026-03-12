import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ChannelPlatform = 'discord' | 'telegram';
export type VerboseLoggingTarget = 'channel' | 'thread' | string;

export interface ChannelConfig {
  platform: ChannelPlatform;
  label?: string;
  enabled: boolean;
  token: string;
  botId?: string;
  channelId: string;
  requireMentions: boolean;
  verboseLogging: boolean;
  verboseLoggingTarget: VerboseLoggingTarget;
}

export interface AnonymousTokenEntry {
  tokenId: string;
  createdAt: Date;
  lastConnectedAt?: Date;
  expiresAt: Date;
  revokedAt?: Date;
}


export type AgentDocument = Agent & Document;

/**
 * Agent Schema - MVP Minimal Version
 * AI agents that execute tasks using instructions, tools, and models
 * Simplified to essential fields only
 */
@Schema({ timestamps: true })
export class Agent extends BaseSchema {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, enum: ['inactive', 'idle', 'busy', 'suspended'], default: 'inactive' })
  status: string;

  @Prop({
    type: String,
    enum: ['managed', 'autonomous', 'hosted'],
    default: 'autonomous'
  })
  type: string;

  @Prop({
    type: String,
    enum: ['claude-agent-sdk', 'vercel-ai-sdk'],
    default: 'claude-agent-sdk'
  })
  framework: string;

  @Prop({ type: String, ref: 'Instruction' })
  instructionId?: string;

  @Prop({ type: String, ref: 'Guardrail' })
  guardrailId?: string;

  @Prop({ type: String, ref: 'Deployment' })
  deploymentId?: string; // For autonomous agents - link to LLM deployment

  @Prop({ required: false, type: String, ref: 'Node' })
  nodeId?: string; // For managed agents - node where agent is deployed and managed by the system

  @Prop({
    type: String,
    enum: ['organization.owner', 'organization.editor', 'organization.viewer'],
    default: 'organization.viewer'
  })
  role: string; // RBAC role for agent to access MCP tools

  @Prop({ default: [] })
  tags: string[];

  // Authentication & Connection Management (both managed and autonomous agents)
  @Prop({ required: false, select: false })
  secret?: string; // Hashed secret for agent authentication

  @Prop({ type: [String], ref: 'Tool', default: [] })
  allowedToolIds: string[]; // Whitelist of tool IDs (MCP tool sets) this agent can use

  @Prop({ type: [String], default: [] })
  allowedFunctions: string[]; // Whitelist of runtime function names agent can call (e.g. 'Bash', 'Read', 'mcp__cbm__create_document'). Empty = all allowed.

  /**
   * Runtime configuration with flat structure using prefixes
   *
   * Supported settings:
   * - auth_roles: string[] - Agent roles for RBAC (default: ['agent'])
   * - hosted_maxConcurrency: number - Max concurrent conversations (hosted agents, default: 5)
   * - hosted_idleTimeoutMs: number - Disconnect after idle ms (hosted agents, default: 300000)
   * - hosted_reconnectDelayMs: number - Reconnect delay ms (hosted agents, default: 5000)
   * - hosted_maxSteps: number - Max tool call steps per generateText (hosted agents, default: 10)
   * - claude_model: string - Claude model version (e.g., 'claude-3-5-sonnet-latest')
   * - claude_maxTurns: number - Maximum conversation turns (default: 100)
   * - claude_permissionMode: string - Permission mode (default: 'bypassPermissions')
   * - claude_resume: boolean - Resume capability (default: true)
   * - claude_oauthToken: string - Claude OAuth token (optional)
   * - discord_token: string - Discord bot token (deprecated: use channels[])
   * - discord_channelIds: string[] - Discord channel IDs (deprecated: use channels[])
   * - discord_botId: string - Discord bot ID (deprecated: use channels[])
   * - telegram_token: string - Telegram bot token (deprecated: use channels[])
   * - telegram_groupIds: string[] - Telegram group IDs (deprecated: use channels[])
   * - telegram_botUsername: string - Telegram bot username (deprecated: use channels[])
   *
   * Example:
   * {
   *   auth_roles: ['agent'],
   *   claude_model: 'claude-3-5-sonnet-latest',
   *   claude_maxTurns: 100,
   *   discord_token: 'xxx',
   *   discord_channelIds: ['123', '456']
   * }
   */
  @Prop({ type: Object, default: {} })
  settings: Record<string, unknown>;

  /** @deprecated Use Connection module instead. Kept for backward compatibility with existing managed agents. */
  @Prop({
    type: [
      {
        platform: { type: String, enum: ['discord', 'telegram'], required: true },
        label: { type: String },
        enabled: { type: Boolean, required: true, default: true },
        token: { type: String, required: true },
        botId: { type: String },
        channelId: { type: String, required: true },
        requireMentions: { type: Boolean, required: true, default: false },
        verboseLogging: { type: Boolean, required: true, default: false },
        verboseLoggingTarget: { type: String, required: true, default: 'channel' },
      },
    ],
    default: [],
  })
  channels: ChannelConfig[];

  // Anonymous tokens for chatbot widget integration
  @Prop({
    type: [
      {
        tokenId: { type: String, required: true },
        createdAt: { type: Date, required: true },
        lastConnectedAt: { type: Date },
        expiresAt: { type: Date, required: true },
        revokedAt: { type: Date },
      },
    ],
    default: [],
    select: false,
  })
  anonymousTokens: AnonymousTokenEntry[];

  // Connection tracking
  @Prop()
  lastConnectedAt?: Date;

  @Prop()
  lastHeartbeatAt?: Date;

  @Prop({ default: 0 })
  connectionCount: number;

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
  // _id is automatically provided by MongoDB
}

export const AgentSchema = SchemaFactory.createForClass(Agent);

// Indexes for performance
AgentSchema.index({ status: 1, createdAt: -1 });
AgentSchema.index({ type: 1 });
AgentSchema.index({ framework: 1 });
AgentSchema.index({ nodeId: 1 });
AgentSchema.index({ instructionId: 1 });
AgentSchema.index({ guardrailId: 1 });
AgentSchema.index({ tags: 1 });
AgentSchema.index({ name: 'text', description: 'text' });
