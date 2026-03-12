import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext, PredefinedRole } from '@hydrabyte/shared';
import { Action, ActionDocument } from './action.schema';
import { CreateActionDto } from './dto/create-action.dto';
import { ActorRole } from './action.enum';
import { ConversationService } from '../conversation/conversation.service';

@Injectable()
export class ActionService extends BaseService<Action> {
  protected readonly logger = new Logger(ActionService.name);

  constructor(
    @InjectModel(Action.name)
    actionModel: Model<ActionDocument>,
    private readonly conversationService: ConversationService,
  ) {
    super(actionModel as any);
  }

  /**
   * Create an action directly, bypassing RBAC.
   * Used for agents and external connections (Discord/Telegram).
   */
  async createActionDirect(
    dto: CreateActionDto,
    owner: { orgId: string; agentId?: string; userId?: string },
  ): Promise<Action> {
    const actorId = owner.userId || owner.agentId || '';

    const action = await this.model.create({
      ...dto,
      owner: {
        orgId: owner.orgId || '',
        agentId: owner.agentId || '',
        userId: owner.userId || '',
        groupId: '',
        appId: '',
      },
      createdBy: actorId,
      updatedBy: actorId,
    });

    await this._updateConversationMetadata(dto, owner.orgId, actorId);

    this.logger.log(
      `Created action (direct) ${(action as any)._id} [${dto.type}] in conversation ${dto.conversationId}`,
    );

    return action as unknown as Action;
  }

  /**
   * Create an action with RBAC check.
   */
  async createAction(dto: CreateActionDto, context: RequestContext): Promise<Action> {
    const action = await this.create(dto, context);

    await this._updateConversationMetadata(dto, context.orgId, context.userId);

    this.logger.log(
      `Created action ${(action as any)._id} [${dto.type}] in conversation ${dto.conversationId}`,
    );

    return action as Action;
  }

  /**
   * Get actions for a conversation with pagination (chronological order).
   */
  async getConversationActions(
    conversationId: string,
    page: number = 1,
    limit: number = 50,
    context: RequestContext,
  ): Promise<{ data: Action[]; total: number; page: number; limit: number }> {
    const filter = { conversationId, isDeleted: false };
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Get actions by actor role.
   */
  async getActionsByRole(
    conversationId: string,
    role: ActorRole,
    context: RequestContext,
  ): Promise<Action[]> {
    return this.model
      .find({ conversationId, 'actor.role': role, isDeleted: false })
      .sort({ createdAt: 1 })
      .exec();
  }

  /**
   * Get last N actions from a conversation (chronological).
   */
  async getLastActions(
    conversationId: string,
    count: number,
    context: RequestContext,
  ): Promise<Action[]> {
    const actions = await this.model
      .find({ conversationId, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(count)
      .exec();

    return actions.reverse();
  }

  /**
   * Get action thread (parent + children).
   */
  async getActionThread(actionId: string, context: RequestContext): Promise<Action[]> {
    const action = await this.findById(new Types.ObjectId(actionId) as any, context);
    if (!action) return [];

    const children = await this.model
      .find({ parentId: actionId, isDeleted: false })
      .sort({ createdAt: 1 })
      .exec();

    return [action as any, ...children];
  }

  /**
   * Get action statistics for a conversation.
   */
  async getActionStatistics(
    conversationId: string,
    context: RequestContext,
  ): Promise<{
    total: number;
    byRole: Record<string, number>;
    byType: Record<string, number>;
    totalInputTokens: number;
    totalOutputTokens: number;
  }> {
    const actions = await this.model
      .find({ conversationId, isDeleted: false })
      .exec();

    const stats = {
      total: actions.length,
      byRole: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };

    for (const action of actions) {
      const role = action.actor?.role || 'unknown';
      stats.byRole[role] = (stats.byRole[role] || 0) + 1;
      stats.byType[action.type] = (stats.byType[action.type] || 0) + 1;

      if (action.usage) {
        stats.totalInputTokens += action.usage.inputTokens || 0;
        stats.totalOutputTokens += action.usage.outputTokens || 0;
      }
    }

    return stats;
  }

  private async _updateConversationMetadata(
    dto: CreateActionDto,
    orgId: string,
    actorId: string,
  ): Promise<void> {
    await this.conversationService.updateLastMessage(
      dto.conversationId,
      dto.content,
      dto.actor.role,
      new Date(),
    );
    await this.conversationService.incrementMessageCount(dto.conversationId);

    if (dto.usage) {
      const totalTokens = (dto.usage.inputTokens || 0) + (dto.usage.outputTokens || 0);
      const cost = (totalTokens / 1000) * 0.002;
      await this.conversationService.updateTokenUsage(dto.conversationId, totalTokens, cost);
    }

    const context: RequestContext = {
      userId: actorId,
      roles: [PredefinedRole.OrganizationEditor],
      orgId: orgId || '',
      groupId: '',
      agentId: '',
      appId: '',
    };
    const conversation = await this.conversationService.findById(
      new Types.ObjectId(dto.conversationId) as any,
      context,
    );
    if (conversation && conversation.totalMessages % 10 === 0) {
      this.conversationService
        .generateContextSummary(dto.conversationId, context)
        .catch((err) => {
          this.logger.error(
            `Failed to generate summary for conversation ${dto.conversationId}:`,
            err.stack,
          );
        });
    }
  }
}
