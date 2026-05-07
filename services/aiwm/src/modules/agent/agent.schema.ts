import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ChannelPlatform = 'discord' | 'telegram';
export type VerboseLoggingTarget = 'channel' | 'thread' | string;
export type AgentConversationMode = 'per-user' | 'per-session' | 'shared';

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

export interface ExternalSigningKeyEntry {
  keyId: string;
  publicKey: string; // PEM format EC public key
  algorithm: 'ES256';
  createdAt: Date;
  expiresAt?: Date;
  revokedAt?: Date;
  label?: string;
}

export type AgentLogLevel = 'info' | 'warn' | 'error';

export interface AgentLog {
  level: AgentLogLevel;
  message: string;
  time: Date;
  data?: Record<string, any>;
}


// ─── Adaptive RAG interfaces ────────────────────────────────────────────────

/** Cấu hình cho một intent trong bộ phân loại ý định */
export interface RagIntentRule {
  /** Tên intent: GREETING | SKIP_OOD | SKIP_GUARD | SKIP_PII | SIMPLE_RAG | COMPLEX_RAG */
  name: string;
  /** Có cần tìm kiếm knowledge base không */
  requiresRag: boolean;
  /** Override collectionIds cho intent này (nếu không set → dùng collections chung) */
  collectionIds?: string[];
  /** Override topK cho intent này */
  topK?: number;
}

/** Cấu hình một knowledge collection */
export interface RagCollectionConfig {
  collectionId: string;
  label?: string;
  type?: 'faq' | 'procedure' | 'general';
  topK: number;
  minScore: number;
  /** Chỉ search collection này khi intent thuộc danh sách (rỗng = tất cả intents có RAG) */
  intents?: string[];
}

/** Cấu hình grader (relevance + hallucination check) */
export interface RagGraderConfig {
  /** Bật relevance grading — lọc chunk không liên quan trước khi đưa vào LLM */
  relevanceEnabled: boolean;
  /** Ngưỡng score để chunk được coi là relevant (0-1) */
  relevanceThreshold: number;
  /** Bật hallucination check — verify câu trả lời có bám sát context không */
  hallucinationEnabled: boolean;
  /** Chỉ check hallucination với các intents này (rỗng = tất cả) */
  hallucinationIntents?: string[];
  /** Deployment ID dùng cho grading (mặc định dùng deployment của agent) */
  deploymentId?: string;
}

/**
 * Mức độ ghi log pipeline vào conversation actions:
 * - 'off': không publish action nào cho RAG (silent — chỉ sources kèm message cuối)
 * - 'summary' (mặc định): 1 cặp tool_use/tool_result tổng quanh search step
 * - 'verbose': summary + thinking action cho intent classify, reformulate (nếu xảy ra), grade (nếu bật)
 */
export type AdaptiveRagTraceLevel = 'off' | 'summary' | 'verbose';

/** Cấu hình Adaptive RAG toàn phần cho agent */
export interface AgentRagConfig {
  enabled: boolean;
  intentClassifier: {
    enabled: boolean;
    /** Deployment ID dùng cho intent classification (mặc định dùng deployment của agent) */
    deploymentId?: string;
    intents: RagIntentRule[];
  };
  collections: RagCollectionConfig[];
  query: {
    parallelSearch: boolean;
    maxRetries: number;
    reformulateOnLowScore: boolean;
  };
  grader: RagGraderConfig;
  /** Mức độ trace pipeline ra conversation actions (mặc định 'summary') */
  traceLevel?: AdaptiveRagTraceLevel;
}

// ─── End Adaptive RAG interfaces ────────────────────────────────────────────

export type AgentDocument = Agent & Document;

/**
 * Agent Schema - MVP Minimal Version
 * AI agents that execute tasks using instructions, tools, and models
 * Simplified to essential fields only
 */
@Schema({ timestamps: true, collection: 'agents' })
export class Agent extends BaseSchema {
  @Prop({ type: String, index: true })
  code?: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, enum: ['inactive', 'idle', 'busy', 'suspended', 'sleep'], default: 'inactive' })
  status: string;

  @Prop({
    type: String,
    enum: ['assistant', 'engineer'],
    default: 'engineer'
  })
  type: string;

  @Prop({
    type: String,
    enum: ['claude-agent-sdk', 'vercel-ai-sdk', 'pi-agent-sdk'],
    default: 'claude-agent-sdk'
  })
  framework: string;

  @Prop({ type: String, ref: 'Instruction' })
  instructionId?: string;

  @Prop({ type: String, ref: 'Guardrail' })
  guardrailId?: string;

  @Prop({ type: String, ref: 'Deployment' })
  deploymentId?: string; // For assistant/engineer agents - link to LLM deployment

  @Prop({ required: false, type: String, ref: 'Node' })
  nodeId?: string; // For engineer agents - node where agent is deployed and managed by the system

  @Prop({
    type: String,
    enum: ['organization.owner', 'organization.editor', 'organization.viewer'],
    default: 'organization.viewer'
  })
  role: string; // RBAC role for agent to access MCP tools

  @Prop({ default: [] })
  tags: string[];

  // Authentication & Connection Management (both assistant and engineer agents)
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
   * - assistant_maxConcurrency: number - Max concurrent conversations (assistant agents, default: 5)
   * - assistant_idleTimeoutMs: number - Disconnect after idle ms (assistant agents, default: 300000)
   * - assistant_reconnectDelayMs: number - Reconnect delay ms (assistant agents, default: 5000)
   * - assistant_maxSteps: number - Max tool call steps per generateText (assistant agents, default: 10)
   * - claude_model: string - Claude model version (e.g., 'claude-3-5-sonnet-latest')
   * - claude_maxTurns: number - Maximum conversation turns (default: 100)
   * - claude_permissionMode: string - Permission mode (default: 'bypassPermissions')
   * - claude_resume: boolean - Resume capability (default: true)
   * - claude_oauthToken: string - Claude OAuth token (optional)
   * - agent_taskRetryLimit: number - Max consecutive failures for same systemTask before auto-sleep (default: 3)
   * - agent_taskSleepMinutes: number - Minutes to sleep after hitting taskRetryLimit (default: 240 = 4 hours)
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

  /** @deprecated Use Connection module instead. Kept for backward compatibility with existing engineer agents. */
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

  // External signing keys for partner-signed anonymous tokens (ES256)
  @Prop({
    type: [
      {
        keyId: { type: String, required: true },
        publicKey: { type: String, required: true },
        algorithm: { type: String, enum: ['ES256'], required: true, default: 'ES256' },
        createdAt: { type: Date, required: true },
        expiresAt: { type: Date },
        revokedAt: { type: Date },
        label: { type: String },
      },
    ],
    default: [],
    select: false,
  })
  externalSigningKeys: ExternalSigningKeyEntry[];

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

  // Debug logs (max 100, rotate via $push + $slice)
  @Prop({
    type: [
      {
        level: { type: String, enum: ['info', 'warn', 'error'], required: true, default: 'info' },
        message: { type: String, required: true },
        time: { type: Date, required: true },
        data: { type: Object },
      },
    ],
    default: [],
    select: false,
  })
  logs: AgentLog[];

  // RAG configuration (legacy — kept for backward compatibility)
  @Prop({ default: false })
  ragEnabled: boolean;

  @Prop({ type: [{ type: Types.ObjectId }], default: [] })
  ragCollectionIds: Types.ObjectId[];

  @Prop({
    type: {
      topK: { type: Number, default: 5 },
      minScore: { type: Number, default: 0.7 },
    },
    default: () => ({ topK: 5, minScore: 0.7 }),
  })
  ragSettings: {
    topK: number;
    minScore: number;
  };

  // Adaptive RAG configuration (v2 — replaces legacy ragEnabled/ragCollectionIds/ragSettings)
  @Prop({
    type: {
      enabled: { type: Boolean, default: false },
      intentClassifier: {
        enabled: { type: Boolean, default: false },
        deploymentId: { type: String },
        intents: [
          {
            name: { type: String, required: true },
            requiresRag: { type: Boolean, required: true },
            collectionIds: [{ type: String }],
            topK: { type: Number },
          },
        ],
      },
      collections: [
        {
          collectionId: { type: String, required: true },
          label: { type: String },
          type: { type: String, enum: ['faq', 'procedure', 'general'] },
          topK: { type: Number, default: 5 },
          minScore: { type: Number, default: 0.7 },
          intents: [{ type: String }],
        },
      ],
      query: {
        parallelSearch: { type: Boolean, default: true },
        maxRetries: { type: Number, default: 1 },
        reformulateOnLowScore: { type: Boolean, default: false },
      },
      grader: {
        relevanceEnabled: { type: Boolean, default: false },
        relevanceThreshold: { type: Number, default: 0.5 },
        hallucinationEnabled: { type: Boolean, default: false },
        hallucinationIntents: [{ type: String }],
        deploymentId: { type: String },
      },
      traceLevel: { type: String, enum: ['off', 'summary', 'verbose'], default: 'summary' },
    },
    default: null,
  })
  ragConfig?: AgentRagConfig | null;

  // Connection tracking
  @Prop()
  lastConnectedAt?: Date;

  @Prop()
  lastHeartbeatAt?: Date;

  // Sleep state
  @Prop()
  sleepReason?: string;

  @Prop()
  sleepSince?: Date;

  @Prop({ type: Date, default: null })
  sleepUntil?: Date | null;

  // Task retry tracking — used by heartbeat circuit breaker to auto-sleep
  // an agent that keeps failing the same systemTask
  @Prop({
    type: {
      taskKey: { type: String, required: true },
      firstSeenAt: { type: Date, required: true },
      lastAttemptAt: { type: Date, required: true },
      attemptCount: { type: Number, required: true, default: 1 },
    },
    default: null,
  })
  currentTask?: {
    taskKey: string;
    firstSeenAt: Date;
    lastAttemptAt: Date;
    attemptCount: number;
  } | null;

  // Conversation scoping mode — applies to anonymous WS clients and Connection Worker users
  // Authenticated WS users select conversation manually and are not affected by this setting
  @Prop({
    type: String,
    enum: ['per-user', 'per-session', 'shared'],
    default: 'per-user',
  })
  conversationMode: AgentConversationMode;

  // Session inactivity timeout in ms for per-session mode (default: 30 minutes)
  @Prop({ type: Number, default: 1800000 })
  sessionTimeoutMs: number;

  @Prop({ default: 0 })
  connectionCount: number;

  @Prop({ type: String })
  version?: string; // Last reported version by agent on connect

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
