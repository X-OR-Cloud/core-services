import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

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

  @Prop({ required: true, enum: ['active', 'inactive', 'busy', 'suspended'] })
  status: string;

  @Prop({
    type: String,
    enum: ['managed', 'autonomous'],
    default: 'autonomous'
  })
  type: string;

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

  // Authentication & Connection Management (only for managed agents)
  @Prop({ required: false, select: false })
  secret?: string; // Hashed secret for agent authentication (managed only)

  @Prop({ type: [String], ref: 'Tool', default: [] })
  allowedToolIds: string[]; // Whitelist of tool IDs this agent can use

  /**
   * Runtime configuration with flat structure using prefixes
   *
   * Supported settings:
   * - auth_roles: string[] - Agent roles for RBAC (default: ['agent'])
   * - claude_model: string - Claude model version (e.g., 'claude-3-5-sonnet-latest')
   * - claude_maxTurns: number - Maximum conversation turns (default: 100)
   * - claude_permissionMode: string - Permission mode (default: 'bypassPermissions')
   * - claude_resume: boolean - Resume capability (default: true)
   * - claude_oauthToken: string - Claude OAuth token (optional)
   * - discord_token: string - Discord bot token
   * - discord_channelIds: string[] - Discord channel IDs
   * - discord_botId: string - Discord bot ID
   * - telegram_token: string - Telegram bot token
   * - telegram_groupIds: string[] - Telegram group IDs
   * - telegram_botUsername: string - Telegram bot username
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
AgentSchema.index({ nodeId: 1 });
AgentSchema.index({ instructionId: 1 });
AgentSchema.index({ guardrailId: 1 });
AgentSchema.index({ tags: 1 });
AgentSchema.index({ name: 'text', description: 'text' });
