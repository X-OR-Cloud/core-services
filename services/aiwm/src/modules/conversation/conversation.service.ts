import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Redis from 'ioredis';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { buildRedisConfig } from '../../config/redis.config';
import { Conversation, ConversationDocument } from './conversation.schema';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { UtilService } from '../util/util.service';
import { GenerateTextRequestDto } from '../util/dto/text-generation.dto';
import { AgentConversationMode } from '../agent/agent.schema';
import { Action, ActionDocument } from '../action/action.schema';
import { ActionType } from '../action/action.enum';
import {
  computeFrt,
  computeResponseDeltas,
  computeAvg,
  computeP90,
  SlaAction,
} from '../../core/sla.helper';

export interface ConvSummary {
  id: string;
  num: number;
  title: string;
  summary: string;
  lastMessage: { content: string; role: string; createdAt: Date } | null;
  updatedAt: Date;
  isCurrent: boolean;
}

@Injectable()
export class ConversationService extends BaseService<Conversation> {
  protected readonly logger = new Logger(ConversationService.name);

  constructor(
    @InjectModel(Conversation.name)
    conversationModel: Model<ConversationDocument>,
    @InjectModel(Action.name)
    private readonly actionModel: Model<ActionDocument>,
    private readonly utilService: UtilService,
  ) {
    super(conversationModel as any);
  }

  // ── Redis pin helpers ──────────────────────────────────────────────────────

  private _redis: Redis | null = null;
  private get redis(): Redis {
    if (!this._redis) this._redis = new Redis(buildRedisConfig());
    return this._redis;
  }

  private _pinKey(orgId: string, agentId: string, userId: string): string {
    return `cnv:pin:${orgId}:${agentId}:${userId}`;
  }

  async getPinnedConversationId(orgId: string, agentId: string, userId: string): Promise<string | null> {
    return this.redis.get(this._pinKey(orgId, agentId, userId));
  }

  async setPinnedConversationId(orgId: string, agentId: string, userId: string, convId: string): Promise<void> {
    await this.redis.set(this._pinKey(orgId, agentId, userId), convId);
  }

  // ── Scope builder ──────────────────────────────────────────────────────────

  // shared mode lists all convs for (orgId, agentId); others scope by userId
  private _buildScope(orgId: string, agentId: string, userId: string, mode: AgentConversationMode): Record<string, unknown> {
    if (mode === 'shared') return { 'owner.orgId': orgId, agentId };
    return { 'owner.orgId': orgId, agentId, userId };
  }

  // ── Conversation management ────────────────────────────────────────────────

  /**
   * List recent conversations for a user+agent, ordered newest-first.
   * Assigns positional `num` based on canonical sort (createdAt asc, _id asc).
   */
  async listConversations(params: {
    orgId: string;
    agentId: string;
    userId: string;
    mode: AgentConversationMode;
    limit?: number;
    currentConvId?: string;
  }): Promise<ConvSummary[]> {
    const { orgId, agentId, userId, mode, limit = 10, currentConvId } = params;
    const scope = this._buildScope(orgId, agentId, userId, mode);
    const filter = { ...scope, isDeleted: false };

    const [total, convs] = await Promise.all([
      this.model.countDocuments(filter),
      this.model.find(filter).sort({ createdAt: -1, _id: -1 }).limit(Math.min(limit, 20)).lean().exec(),
    ]);

    return (convs as any[]).map((c, i) => ({
      id: c._id.toString(),
      num: total - i,
      title: c.title || '',
      summary: c.contextSummary || (c.lastMessage?.content?.substring(0, 100) ?? ''),
      lastMessage: c.lastMessage ?? null,
      updatedAt: c.updatedAt,
      isCurrent: c._id.toString() === currentConvId,
    }));
  }

  /**
   * Create a new conversation and set it as the pinned conversation for the user.
   * Optional `title` overrides the default generated title.
   */
  async createAndPin(params: {
    orgId: string;
    agentId: string;
    userId: string;
    mode: AgentConversationMode;
    userType: 'authenticated' | 'anonymous';
    title?: string;
  }): Promise<{ conv: Conversation; num: number }> {
    const { orgId, agentId, userId, userType, title } = params;

    const newConv = await this.model.create({
      title: title || `Conversation with agent ${agentId}`,
      agentId,
      userId,
      userType,
      conversationType: 'chat',
      status: 'active',
      totalTokens: 0,
      totalMessages: 0,
      totalCost: 0,
      participants: [
        { type: 'user' as const, id: userId, joined: new Date() },
        { type: 'agent' as const, id: agentId, joined: new Date() },
      ],
      owner: { orgId, userId: userType === 'authenticated' ? userId : '', groupId: '', agentId, appId: '' },
      createdBy: userId || agentId,
      updatedBy: userId || agentId,
    });

    const convId = (newConv as any)._id.toString();
    await this.setPinnedConversationId(orgId, agentId, userId, convId);

    const scope = this._buildScope(orgId, agentId, userId, params.mode);
    const total = await this.model.countDocuments({ ...scope, isDeleted: false });

    this.logger.log(`createAndPin: new conv ${convId} #${total} for user ${userId} agent ${agentId}`);
    return { conv: newConv as Conversation, num: total };
  }

  /**
   * Find conversation at position `num` (1-based, canonical sort) and pin it for the user.
   * Optional `title` renames the conversation in DB.
   */
  async pinByPosition(params: {
    orgId: string;
    agentId: string;
    userId: string;
    mode: AgentConversationMode;
    num: number;
    title?: string;
  }): Promise<Conversation> {
    const { orgId, agentId, userId, mode, num, title } = params;
    if (num < 1) throw new Error('Conversation number must be a positive integer');

    const scope = this._buildScope(orgId, agentId, userId, mode);
    const filter = { ...scope, isDeleted: false };

    const conv = await this.model
      .findOne(filter)
      .sort({ createdAt: 1, _id: 1 })
      .skip(num - 1)
      .lean()
      .exec();

    if (!conv) throw new Error(`Conversation #${num} not found`);

    const convId = (conv as any)._id.toString();
    await this.setPinnedConversationId(orgId, agentId, userId, convId);

    if (title) {
      await this.model.findByIdAndUpdate(convId, { $set: { title } }).exec();
      (conv as any).title = title;
    }

    this.logger.log(`pinByPosition: pinned conv ${convId} #${num} for user ${userId} agent ${agentId}${title ? ` title="${title}"` : ''}`);
    return conv as Conversation;
  }

  async findAll(options: FindManyOptions, context: RequestContext): Promise<FindManyResult<Conversation>> {
    options.statisticFields = ['status', 'conversationType'];
    options.sort = { updatedAt: -1 };

    // Support filtering by agentId via participants
    if (options.filter?.agentId) {
      const agentId = options.filter.agentId;
      delete options.filter.agentId;
      options.filter['participants'] = { $elemMatch: { type: 'agent', id: agentId } };
    }

    // Extract special cross-collection filters
    const keyword = options.filter?.keyword as string | undefined;
    const unanswered = options.filter?.unanswered === 'true' || options.filter?.unanswered === true;
    const lowResponseRate = options.filter?.lowResponseRate === 'true' || options.filter?.lowResponseRate === true;
    delete options.filter?.keyword;
    delete options.filter?.unanswered;
    delete options.filter?.lowResponseRate;

    const idSets: string[][] = [];

    if (keyword) {
      const ids = await this.actionModel.distinct('conversationId', {
        type: ActionType.MESSAGE,
        content: { $regex: keyword, $options: 'i' },
        isDeleted: false,
      });
      idSets.push(ids.map(String));
    }

    if (unanswered) {
      // Last action per conversation is from user and older than 30s (no agent reply yet)
      const threshold = new Date(Date.now() - 30_000);
      const results = await this.actionModel.aggregate([
        { $match: { type: ActionType.MESSAGE, isDeleted: false } },
        { $sort: { conversationId: 1, createdAt: -1 } },
        { $group: { _id: '$conversationId', lastRole: { $first: '$actor.role' }, lastAt: { $first: '$createdAt' } } },
        { $match: { lastRole: 'user', lastAt: { $lt: threshold } } },
      ]);
      idSets.push(results.map((r: any) => String(r._id)));
    }

    if (lowResponseRate) {
      // Conversations where agent action count < user action count
      const results = await this.actionModel.aggregate([
        { $match: { type: ActionType.MESSAGE, isDeleted: false } },
        { $group: { _id: { conversationId: '$conversationId', role: '$actor.role' }, count: { $sum: 1 } } },
        { $group: { _id: '$_id.conversationId', counts: { $push: { role: '$_id.role', count: '$count' } } } },
        {
          $project: {
            userCount: {
              $ifNull: [
                { $arrayElemAt: [{ $map: { input: { $filter: { input: '$counts', cond: { $eq: ['$$this.role', 'user'] } } }, in: '$$this.count' } }, 0] },
                0,
              ],
            },
            agentCount: {
              $ifNull: [
                { $arrayElemAt: [{ $map: { input: { $filter: { input: '$counts', cond: { $eq: ['$$this.role', 'agent'] } } }, in: '$$this.count' } }, 0] },
                0,
              ],
            },
          },
        },
        { $match: { $expr: { $lt: ['$agentCount', '$userCount'] } } },
      ]);
      idSets.push(results.map((r: any) => String(r._id)));
    }

    if (idSets.length > 0) {
      const intersected = idSets.reduce((a, b) => a.filter((id) => b.includes(id)));
      options.filter = { ...options.filter, _id: { $in: intersected } };
    }

    return await super.findAll(options, context);
  }

  /**
   * Find a conversation by ID, bypassing RBAC.
   * Used for anonymous/agent contexts where RBAC context is incomplete.
   */
  async findByIdDirect(conversationId: string): Promise<Conversation | null> {
    return this.model.findById(conversationId).lean().exec() as Promise<Conversation | null>;
  }

  /**
   * Find or create a conversation scoped to (userId, agentId) — 'user' mode.
   * Same conversation across all connections for this user+agent pair.
   */
  async findOrCreateForUser(
    userId: string,
    agentId: string,
    orgId: string,
    userType: 'authenticated' | 'anonymous',
  ): Promise<Conversation> {
    const existing = await this.model.findOne({
      agentId,
      userId,
      status: 'active',
      isDeleted: false,
    }).exec();

    if (existing) {
      this.logger.log(`Reusing existing conversation ${existing._id} for user ${userId} + agent ${agentId}`);
      return existing as Conversation;
    }

    const newConversation = await this.model.create({
      title: `Conversation with agent ${agentId}`,
      description: '',
      agentId,
      userId,
      userType,
      conversationType: 'chat',
      status: 'active',
      totalTokens: 0,
      totalMessages: 0,
      totalCost: 0,
      participants: [
        { type: 'user' as const, id: userId, joined: new Date() },
        { type: 'agent' as const, id: agentId, joined: new Date() },
      ],
      owner: {
        orgId,
        userId: userType === 'authenticated' ? userId : '',
        groupId: '',
        agentId,
        appId: '',
      },
      createdBy: userId || agentId,
      updatedBy: userId || agentId,
    });

    this.logger.log(`Created new conversation ${newConversation._id} for user ${userId} + agent ${agentId}`);
    return newConversation as Conversation;
  }

  /**
   * Find or create a conversation scoped to (connectionId, userId, agentId) — 'connection' mode (default).
   * Each user has a separate conversation per connection.
   */
  async findOrCreateForConnection(
    connectionId: string,
    userId: string,
    agentId: string,
    orgId: string,
    userType: 'authenticated' | 'anonymous',
  ): Promise<Conversation> {
    const existing = await this.model.findOne({
      agentId,
      userId,
      connectionId,
      status: 'active',
      isDeleted: false,
    }).exec();

    if (existing) {
      this.logger.log(`Reusing existing conversation ${existing._id} for connection ${connectionId} + user ${userId} + agent ${agentId}`);
      return existing as Conversation;
    }

    const newConversation = await this.model.create({
      title: `Conversation with agent ${agentId}`,
      description: '',
      agentId,
      userId,
      connectionId,
      userType,
      conversationType: 'chat',
      status: 'active',
      totalTokens: 0,
      totalMessages: 0,
      totalCost: 0,
      participants: [
        { type: 'user' as const, id: userId, joined: new Date() },
        { type: 'agent' as const, id: agentId, joined: new Date() },
      ],
      owner: {
        orgId,
        userId: userType === 'authenticated' ? userId : '',
        groupId: '',
        agentId,
        appId: '',
      },
      createdBy: userId || agentId,
      updatedBy: userId || agentId,
    });

    this.logger.log(`Created new conversation ${newConversation._id} for connection ${connectionId} + user ${userId} + agent ${agentId}`);
    return newConversation as Conversation;
  }

  /**
   * Find or create a shared conversation scoped to (connectionId, agentId) — 'shared' mode.
   * All users in the same connection share one conversation.
   */
  async findOrCreateShared(
    connectionId: string,
    agentId: string,
    orgId: string,
  ): Promise<Conversation> {
    const existing = await this.model.findOne({
      agentId,
      connectionId,
      status: 'active',
      isDeleted: false,
    }).exec();

    if (existing) {
      this.logger.log(`Reusing shared conversation ${existing._id} for connection ${connectionId} + agent ${agentId}`);
      return existing as Conversation;
    }

    const newConversation = await this.model.create({
      title: `Shared conversation with agent ${agentId}`,
      description: '',
      agentId,
      userId: '',
      connectionId,
      userType: 'anonymous',
      conversationType: 'chat',
      status: 'active',
      totalTokens: 0,
      totalMessages: 0,
      totalCost: 0,
      participants: [
        { type: 'agent' as const, id: agentId, joined: new Date() },
      ],
      owner: {
        orgId,
        userId: '',
        groupId: '',
        agentId,
        appId: '',
      },
      createdBy: agentId,
      updatedBy: agentId,
    });

    this.logger.log(`Created shared conversation ${newConversation._id} for connection ${connectionId} + agent ${agentId}`);
    return newConversation as Conversation;
  }

  /**
   * Find or create conversation scoped to (orgId, agentId) — 'shared' mode.
   * All users across all channels share one conversation per org+agent.
   */
  async findOrCreateAgentShared(orgId: string, agentId: string): Promise<Conversation> {
    const existing = await this.model.findOne({
      'owner.orgId': orgId,
      agentId,
      status: 'active',
      isDeleted: false,
    }).exec();

    if (existing) {
      this.logger.log(`Reusing shared conversation ${existing._id} for org ${orgId} + agent ${agentId}`);
      return existing as Conversation;
    }

    const newConversation = await this.model.create({
      title: `Shared conversation with agent ${agentId}`,
      agentId,
      userId: '',
      userType: 'anonymous',
      conversationType: 'chat',
      status: 'active',
      totalTokens: 0,
      totalMessages: 0,
      totalCost: 0,
      participants: [{ type: 'agent' as const, id: agentId, joined: new Date() }],
      owner: { orgId, userId: '', groupId: '', agentId, appId: '' },
      createdBy: agentId,
      updatedBy: agentId,
    });

    this.logger.log(`Created shared conversation ${newConversation._id} for org ${orgId} + agent ${agentId}`);
    return newConversation as Conversation;
  }

  /**
   * Find or create conversation scoped to (orgId, agentId, userId) — 'per-user' mode.
   * Same conversation for a user across all channels.
   */
  async findOrCreatePerUser(
    orgId: string,
    agentId: string,
    userId: string,
    userType: 'authenticated' | 'anonymous',
  ): Promise<Conversation> {
    const existing = await this.model.findOne({
      'owner.orgId': orgId,
      agentId,
      userId,
      status: 'active',
      isDeleted: false,
    }).exec();

    if (existing) {
      this.logger.log(`Reusing per-user conversation ${existing._id} for user ${userId} + agent ${agentId}`);
      return existing as Conversation;
    }

    const newConversation = await this.model.create({
      title: `Conversation with agent ${agentId}`,
      agentId,
      userId,
      userType,
      conversationType: 'chat',
      status: 'active',
      totalTokens: 0,
      totalMessages: 0,
      totalCost: 0,
      participants: [
        { type: 'user' as const, id: userId, joined: new Date() },
        { type: 'agent' as const, id: agentId, joined: new Date() },
      ],
      owner: { orgId, userId: userType === 'authenticated' ? userId : '', groupId: '', agentId, appId: '' },
      createdBy: userId || agentId,
      updatedBy: userId || agentId,
    });

    this.logger.log(`Created per-user conversation ${newConversation._id} for user ${userId} + agent ${agentId}`);
    return newConversation as Conversation;
  }

  /**
   * Find or create conversation — 'per-session' mode.
   * Reuses the most recent active conversation if still within sessionTimeoutMs,
   * otherwise creates a new one.
   */
  async findOrCreatePerSession(
    orgId: string,
    agentId: string,
    userId: string,
    sessionTimeoutMs: number,
    userType: 'authenticated' | 'anonymous',
  ): Promise<Conversation> {
    const existing = await this.model
      .findOne({
        'owner.orgId': orgId,
        agentId,
        userId,
        status: 'active',
        isDeleted: false,
      })
      .sort({ updatedAt: -1 })
      .exec();

    if (existing) {
      const updatedAt = (existing as any).updatedAt as Date;
      const isAlive = Date.now() - updatedAt.getTime() < sessionTimeoutMs;
      if (isAlive) {
        this.logger.log(`Reusing per-session conversation ${existing._id} for user ${userId} + agent ${agentId}`);
        return existing as Conversation;
      }
      this.logger.log(`Session expired for conversation ${existing._id}, creating new one`);
    }

    const newConversation = await this.model.create({
      title: `Conversation with agent ${agentId}`,
      agentId,
      userId,
      userType,
      conversationType: 'chat',
      status: 'active',
      totalTokens: 0,
      totalMessages: 0,
      totalCost: 0,
      participants: [
        { type: 'user' as const, id: userId, joined: new Date() },
        { type: 'agent' as const, id: agentId, joined: new Date() },
      ],
      owner: { orgId, userId: userType === 'authenticated' ? userId : '', groupId: '', agentId, appId: '' },
      createdBy: userId || agentId,
      updatedBy: userId || agentId,
    });

    this.logger.log(`Created per-session conversation ${newConversation._id} for user ${userId} + agent ${agentId}`);
    return newConversation as Conversation;
  }

  /**
   * Unified dispatcher — resolves the correct conversation based on agent's conversationMode.
   * Called by ChatGateway (anonymous connect) and RoutingService (Connection Worker).
   */
  async resolveConversation(params: {
    orgId: string;
    agentId: string;
    userId: string;
    mode: AgentConversationMode;
    sessionTimeoutMs: number;
    userType: 'authenticated' | 'anonymous';
  }): Promise<Conversation> {
    const { orgId, agentId, userId, mode, sessionTimeoutMs, userType } = params;

    // Check Redis pin first — personal override for all modes
    const pinnedId = await this.getPinnedConversationId(orgId, agentId, userId);
    if (pinnedId) {
      const pinned = await this.model.findOne({ _id: pinnedId, isDeleted: false }).lean().exec();
      if (pinned) {
        this.logger.debug(`resolveConversation: using pinned conv ${pinnedId} for user ${userId}`);
        return pinned as Conversation;
      }
      // Stale pin — remove and fall through to mode logic
      await this.redis.del(this._pinKey(orgId, agentId, userId));
      this.logger.debug(`resolveConversation: removed stale pin ${pinnedId} for user ${userId}`);
    }

    if (mode === 'shared') {
      return this.findOrCreateAgentShared(orgId, agentId);
    }
    if (mode === 'per-session') {
      return this.findOrCreatePerSession(orgId, agentId, userId, sessionTimeoutMs, userType);
    }
    // default: 'per-user'
    return this.findOrCreatePerUser(orgId, agentId, userId, userType);
  }

  /**
   * Find all active conversations for an agent (updated within last 24h).
   * Used by ChatGateway to rejoin rooms on agent reconnect.
   */
  async findActiveByAgent(agentId: string): Promise<Conversation[]> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.model.find({
      agentId,
      status: 'active',
      isDeleted: false,
      updatedAt: { $gte: cutoff },
    }).lean().exec() as unknown as Conversation[];
  }

  /**
   * Create a new conversation
   */
  async createConversation(
    dto: CreateConversationDto,
    context: RequestContext,
  ): Promise<Conversation> {
    const conversation = await this.create(
      {
        ...dto,
        conversationType: 'chat', // Default to chat
        status: 'active',
        totalTokens: 0,
        totalMessages: 0,
        totalCost: 0,
        participants: [
          {
            type: 'user' as const,
            id: context.userId,
            joined: new Date(),
          },
          {
            type: 'agent' as const,
            id: dto.agentId,
            joined: new Date(),
          },
        ],
        tags: dto.tags || [],
      },
      context,
    );

    this.logger.log(
      `Created conversation ${(conversation as any)._id} for user ${context.userId}`,
    );

    return conversation as Conversation;
  }

  /**
   * Update conversation
   */
  async updateConversation(
    id: string,
    dto: UpdateConversationDto,
    context: RequestContext,
  ): Promise<Conversation> {
    const updated = await this.update(
      new Types.ObjectId(id) as any,
      dto as any,
      context,
    );

    this.logger.log(`Updated conversation ${id}`);

    return updated as Conversation;
  }

  /**
   * Add participant to conversation
   */
  async addParticipant(
    conversationId: string,
    participantType: 'user' | 'agent',
    participantId: string,
    context: RequestContext,
  ): Promise<Conversation> {
    const conversation = await this.findById(
      new Types.ObjectId(conversationId) as any,
      context,
    );

    if (!conversation) {
      throw new NotFoundException(
        `Conversation ${conversationId} not found`,
      );
    }

    // Check if participant already exists
    const exists = conversation.participants?.some(
      (p) => p.type === participantType && p.id === participantId,
    );

    if (exists) {
      this.logger.warn(
        `Participant ${participantId} already in conversation ${conversationId}`,
      );
      return conversation as any;
    }

    // Add new participant
    const updatedParticipants = [
      ...(conversation.participants || []),
      {
        type: participantType,
        id: participantId,
        joined: new Date(),
      },
    ];

    const updated = await this.update(
      new Types.ObjectId(conversationId) as any,
      { participants: updatedParticipants } as any,
      context,
    );

    this.logger.log(
      `Added ${participantType} ${participantId} to conversation ${conversationId}`,
    );

    return updated as Conversation;
  }

  /**
   * Remove participant from conversation
   */
  async removeParticipant(
    conversationId: string,
    participantType: 'user' | 'agent',
    participantId: string,
    context: RequestContext,
  ): Promise<Conversation> {
    const conversation = await this.findById(
      new Types.ObjectId(conversationId) as any,
      context,
    );

    if (!conversation) {
      throw new NotFoundException(
        `Conversation ${conversationId} not found`,
      );
    }

    // Filter out the participant
    const updatedParticipants = (conversation.participants || []).filter(
      (p) => !(p.type === participantType && p.id === participantId),
    );

    const updated = await this.update(
      new Types.ObjectId(conversationId) as any,
      { participants: updatedParticipants } as any,
      context,
    );

    this.logger.log(
      `Removed ${participantType} ${participantId} from conversation ${conversationId}`,
    );

    return updated as Conversation;
  }

  /**
   * Update last message preview
   */
  async updateLastMessage(
    conversationId: string,
    content: string,
    role: string,
    createdAt: Date,
  ): Promise<void> {
    await this.model
      .findByIdAndUpdate(conversationId, {
        $set: {
          lastMessage: {
            content: content.substring(0, 100), // Truncate for preview
            role,
            createdAt,
          },
        },
      })
      .exec();

    this.logger.debug(`Updated last message for conversation ${conversationId}`);
  }

  /**
   * Increment message count
   */
  async incrementMessageCount(conversationId: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(conversationId, {
        $inc: { totalMessages: 1 },
      })
      .exec();
  }

  /**
   * Update token usage
   */
  async updateTokenUsage(
    conversationId: string,
    tokens: number,
    cost: number,
  ): Promise<void> {
    await this.model
      .findByIdAndUpdate(conversationId, {
        $inc: {
          totalTokens: tokens,
          totalCost: cost,
        },
      })
      .exec();

    this.logger.debug(
      `Updated tokens (+${tokens}) and cost (+$${cost.toFixed(4)}) for conversation ${conversationId}`,
    );
  }

  /**
   * Generate context summary for conversation
   * Called every 10 messages
   */
  async generateContextSummary(
    conversationId: string,
    context: RequestContext,
  ): Promise<string> {
    try {
      // Get conversation with recent messages
      const conversation = await this.model.findById(conversationId).exec();

      if (!conversation) {
        throw new NotFoundException(
          `Conversation ${conversationId} not found`,
        );
      }

      const userInput = `Conversation ID: ${conversationId}, Total messages: ${conversation.totalMessages}, Agent: ${conversation.agentId}`;

      const request: GenerateTextRequestDto = {
        fieldDescription:
          'Summarize the conversation context in 2-3 sentences focusing on main topics, key decisions, and current state.',
        userInput,
        maxLength: 150,
      };

      const response = await this.utilService.generateText(request, context);
      const summary = response.generatedText;

      // Update conversation with summary
      await this.model
        .findByIdAndUpdate(conversationId, {
          $set: { contextSummary: summary },
        })
        .exec();

      this.logger.log(
        `Generated context summary for conversation ${conversationId}`,
      );

      return summary;
    } catch (error) {
      this.logger.error(
        `Failed to generate context summary for conversation ${conversationId}:`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get user's conversations
   */
  async getUserConversations(
    userId: string,
    status?: string,
    context?: RequestContext,
  ): Promise<Conversation[]> {
    const filter: any = {
      'participants.id': userId,
      isDeleted: false,
    };

    if (status) {
      filter.status = status;
    }

    const conversations = await this.model
      .find(filter)
      .sort({ updatedAt: -1 })
      .exec();

    return conversations;
  }

  /**
   * Get agent's conversations
   */
  async getAgentConversations(
    agentId: string,
    status?: string,
    context?: RequestContext,
  ): Promise<Conversation[]> {
    const filter: any = {
      agentId,
      isDeleted: false,
    };

    if (status) {
      filter.status = status;
    }

    const conversations = await this.model
      .find(filter)
      .sort({ updatedAt: -1 })
      .exec();

    return conversations;
  }

  /**
   * Archive conversation
   */
  async archiveConversation(
    id: string,
    context: RequestContext,
  ): Promise<Conversation> {
    const updated = await this.update(
      new Types.ObjectId(id) as any,
      { status: 'archived' } as any,
      context,
    );

    this.logger.log(`Archived conversation ${id}`);

    return updated as Conversation;
  }

  /**
   * Clear all chat history (Actions) belonging to a conversation.
   * Soft-deletes Action documents and resets conversation counters.
   * Access: organization.owner or any universe.* role.
   */
  async clearHistory(
    id: string,
    context: RequestContext,
  ): Promise<{ deletedActions: number }> {
    const isOwner = context.roles?.some(
      (r) => r === 'organization.owner' || r.startsWith('universe.'),
    );
    if (!isOwner) {
      throw new ForbiddenException(
        'Only organization.owner or universe.* roles can clear conversation history',
      );
    }

    const conversation = await this.model.findById(id).exec();
    if (!conversation || (conversation as any).isDeleted) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }
    if ((conversation as any).owner?.orgId !== context.orgId) {
      throw new ForbiddenException('Conversation does not belong to your organization');
    }

    const result = await this.actionModel.updateMany(
      { conversationId: id, isDeleted: false },
      { $set: { isDeleted: true, updatedBy: context.userId } },
    ).exec();

    await this.model.findByIdAndUpdate(id, {
      $set: {
        totalMessages: 0,
        totalTokens: 0,
        totalCost: 0,
        lastMessage: null,
        contextSummary: '',
        updatedBy: context.userId,
      },
    }).exec();

    const deletedActions = (result as any).modifiedCount ?? 0;
    this.logger.log(
      `Cleared history for conversation ${id}: ${deletedActions} actions soft-deleted by ${context.userId}`,
    );

    return { deletedActions };
  }

  /**
   * SLA metrics for a single conversation
   */
  async getConversationMetrics(id: string, context: RequestContext): Promise<Record<string, unknown>> {
    const conversation = await this.model.findById(id).lean().exec() as any;
    if (!conversation || conversation.isDeleted) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }
    if (conversation.owner?.orgId !== context.orgId) {
      throw new ForbiddenException('Conversation does not belong to your organization');
    }

    const actions = await this.actionModel
      .find({ conversationId: id, isDeleted: false })
      .sort({ createdAt: 1 })
      .lean()
      .exec() as any[];

    const now = new Date();
    const createdAt = new Date(conversation.createdAt);
    const updatedAt = new Date(conversation.updatedAt);
    const durationSeconds = Math.round(
      ((conversation.status === 'active' ? now : updatedAt).getTime() - createdAt.getTime()) / 1000,
    );

    const slaActions: SlaAction[] = actions.map((a) => ({
      type: a.type,
      actor: { role: a.actor?.role },
      createdAt: new Date(a.createdAt),
    }));

    const frt = computeFrt(slaActions);
    const deltas = computeResponseDeltas(slaActions);

    const byRole: Record<string, number> = { user: 0, agent: 0, system: 0 };
    const errorCount = actions.filter((a) => a.type === ActionType.ERROR).length;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const a of actions) {
      if (a.actor?.role && byRole[a.actor.role] !== undefined) byRole[a.actor.role]++;
      if (a.usage) {
        totalInputTokens += a.usage.inputTokens ?? 0;
        totalOutputTokens += a.usage.outputTokens ?? 0;
      }
    }

    return {
      conversationId: id,
      agentId: conversation.agentId,
      status: conversation.status,
      createdAt: conversation.createdAt,
      durationSeconds,
      totalMessages: conversation.totalMessages ?? actions.length,
      userMessages: byRole.user,
      agentMessages: byRole.agent,
      systemMessages: byRole.system,
      firstResponseTime: {
        ms: frt.ms,
        slaBreached: frt.slaBreached,
      },
      avgResponseTimeMs: computeAvg(deltas),
      p90ResponseTimeMs: computeP90(deltas),
      errorCount,
      tokenUsage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      },
    };
  }

  /**
   * Close conversation
   */
  async closeConversation(
    id: string,
    context: RequestContext,
  ): Promise<Conversation> {
    const updated = await this.update(
      new Types.ObjectId(id) as any,
      { status: 'closed' } as any,
      context,
    );

    this.logger.log(`Closed conversation ${id}`);

    return updated as Conversation;
  }
}
