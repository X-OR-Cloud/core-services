import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Redis from 'ioredis';
import { buildRedisConfig } from '../../config/redis.config';
import { Agent } from '../agent/agent.schema';
import { ConversationService } from '../conversation/conversation.service';
import { ActionService } from '../action/action.service';
import { ActionType, ActorRole } from '../action/action.enum';

export interface DispatchMessageParams {
  orgId: string;
  agentId: string;
  userId: string;
  username?: string;
  fullname?: string;
  conversationId?: string;
  content: string;
  type?: string;
  attachments?: Array<{ type: string; url?: string; filename?: string; mimeType?: string; size?: number }>;
  references?: Array<{ resourceType: string; resourceId?: string; label: string; content?: string }>;
  workId?: string;
}

export interface DispatchMessageResult {
  conversationId: string;
  actionId: string;
  agentId: string;
  agentCode?: string;
  recordedAt: Date;
}

@Injectable()
export class ChatDispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatDispatchService.name);
  private redisPub!: Redis;

  constructor(
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    private readonly conversationService: ConversationService,
    private readonly actionService: ActionService,
  ) {}

  onModuleInit() {
    this.redisPub = new Redis(buildRedisConfig());
    this.redisPub.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
  }

  async onModuleDestroy() {
    await this.redisPub?.quit();
  }

  async dispatchMessage(params: DispatchMessageParams): Promise<DispatchMessageResult> {
    const { orgId, agentId, userId, username, fullname, content, type, attachments, references, workId } = params;

    const agent = await this.agentModel.findOne({ _id: agentId, isDeleted: false }).lean();
    if (!agent) {
      throw new NotFoundException(`Agent not found: ${agentId}`);
    }
    if ((agent as any).orgId && (agent as any).orgId !== orgId) {
      throw new NotFoundException(`Agent not found: ${agentId}`);
    }

    const status: string = (agent as any).status ?? 'inactive';
    if (status === 'suspended') {
      throw new BadRequestException(`Agent is suspended and cannot receive messages.`);
    }
    if (status === 'inactive') {
      throw new BadRequestException(`Agent is inactive. Start the agent before sending messages.`);
    }

    let conversationId = params.conversationId;
    if (conversationId) {
      const conv = await this.conversationService.findByIdDirect(conversationId);
      if (!conv) {
        throw new NotFoundException(`Conversation not found: ${conversationId}`);
      }
    } else {
      const conv = await this.conversationService.resolveConversation({
        orgId,
        agentId,
        userId,
        mode: (agent as any).conversationMode ?? 'per-user',
        sessionTimeoutMs: (agent as any).sessionTimeoutMs ?? 1800000,
        userType: 'authenticated',
      });
      conversationId = (conv as any)._id.toString();
    }

    const actionTypeMap: Record<string, ActionType> = {
      system: ActionType.NOTICE,
    };
    const actionType = actionTypeMap[type ?? ''] ?? ActionType.MESSAGE;

    const savedAction = await this.actionService.createActionDirect(
      {
        conversationId,
        type: actionType,
        actor: {
          role: ActorRole.USER,
          userId,
          displayName: username || userId,
        },
        content,
        metadata: (attachments?.length || references?.length)
          ? {
              ...(attachments?.length ? { attachments } : {}),
              ...(references?.length ? { references } : {}),
            }
          : undefined,
        ...(workId ? { workId } : {}),
      },
      { orgId, userId },
    );

    const actionId = (savedAction as any)._id?.toString() || 'unknown';
    const recordedAt: Date = (savedAction as any).createdAt ?? new Date();

    const msgNonce = `${conversationId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const messageNewPayload = {
      actionId,
      conversationId,
      agentId,
      orgId,
      role: 'user',
      content,
      attachments,
      userId,
      username,
      fullname,
      platform: 'portal',
      msgNonce,
    };

    this.redisPub.publish('chat:message-new', JSON.stringify(messageNewPayload))
      .catch((err: Error) => this.logger.error(`Failed to publish chat:message-new: ${err.message}`));

    this.redisPub.set(`conv:trigger-platform:${conversationId}`, 'portal', 'EX', 600)
      .catch(() => {});

    this.logger.log(
      `[REST-MSG] actionId=${actionId} | userId=${userId} | agentId=${agentId} | conversationId=${conversationId}`,
    );

    return {
      conversationId,
      actionId,
      agentId,
      agentCode: (agent as any).code ?? undefined,
      recordedAt,
    };
  }
}
