import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { PresenceService } from '../presence/presence.service';
import { Agent, AgentDocument } from '../agent/agent.schema';
import { Conversation, ConversationDocument } from '../conversation/conversation.schema';
import { Action, ActionDocument } from '../action/action.schema';
import { ActionType, ActorRole } from '../action/action.enum';
import { HeartbeatService } from '../heartbeat/heartbeat.service';

@WebSocketGateway({
  namespace: '/',
})
export class AgentGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgentGateway.name);
  private redisSub: Redis | null = null;
  private redisPub: Redis | null = null;

  constructor(
    private readonly presenceService: PresenceService,
    private readonly jwtService: JwtService,
    private readonly heartbeatService: HeartbeatService,
    @InjectModel(Agent.name) private readonly agentModel: Model<AgentDocument>,
    @InjectModel(Conversation.name) private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Action.name) private readonly actionModel: Model<ActionDocument>,
  ) {}

  afterInit(_server: Server) {
    this.logger.log('Agent WebSocket Gateway initialized');
  }

  async onModuleInit() {
    const mode = process.env.MODE || 'api';
    if (mode !== 'aws') {
      this.logger.log(`Skipping Redis subscriptions in MODE=${mode}`);
      return;
    }
    const cfg = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      username: process.env.REDIS_USERNAME || undefined,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      enableReadyCheck: false,
    };
    this.redisSub = new Redis(cfg);
    this.redisPub = new Redis(cfg);

    await this.redisSub.subscribe('agent:join-room', 'chat:message-new', 'outbound:command');

    this.redisSub.on('message', async (channel, message) => {
      if (channel === 'agent:join-room') {
        try {
          const { agentId, conversationId } = JSON.parse(message);
          if (!this.server) return;
          const agentSocketIds = await this.presenceService.getAgentSocketIds(agentId);
          if (agentSocketIds.length > 0) {
            this.server.in(agentSocketIds).socketsJoin(`conversation:${conversationId}`);
            this.logger.debug(
              `[Redis] agent:join-room agentId=${agentId} conversationId=${conversationId} sockets=${agentSocketIds.length}`,
            );
          }
        } catch (err: any) {
          this.logger.error(`Failed to process agent:join-room: ${err.message}`);
        }
      }

      if (channel === 'chat:message-new') {
        try {
          if (!this.server) return;
          const parsed = JSON.parse(message);
          const {
            actionId,
            conversationId,
            agentId,
            orgId,
            role,
            content,
            attachments,
            userId,
            username,
            fullname,
            externalUsername,
            externalUserId,
            channelId,
            connectionId,
            platform,
            msgNonce,
          } = parsed;
          let { skipAgent } = parsed;

          // No distributed lock here — engineer agent WS emit is idempotent.
          // The lock in ChatGateway protects lpush chat:task (assistant path only).

          const agentDoc = agentId
            ? await this.agentModel.findOne({ _id: new Types.ObjectId(agentId), isDeleted: false }).lean().exec()
            : null;

          // Only handle engineer agents — assistant agents are routed by ChatGateway via chat:task
          if ((agentDoc as any)?.type !== 'engineer') return;

          if (!skipAgent && (agentDoc as any)?.status === 'sleep') {
            skipAgent = true;
          }

          // Ensure agent sockets are in the conversation room, then broadcast message:new
          if (!skipAgent && agentId) {
            const agentSocketIds = await this.presenceService.getAgentSocketIds(agentId);
            if (agentSocketIds.length > 0) {
              this.server.in(agentSocketIds).socketsJoin(`conversation:${conversationId}`);
            }
          }

          const broadcastPayload = {
            _id: actionId,
            conversationId,
            orgId,
            role,
            content,
            attachments,
            userId,
            username,
            fullname,
            externalUsername,
            externalUserId,
            channelId,
            connectionId,
            platform,
            ...(skipAgent ? { skipAgent: true } : {}),
          };

          this.server.to(`conversation:${conversationId}`).emit('message:new', broadcastPayload);
          this.logger.debug(
            `[Redis] chat:message-new → engineer agent conversationId=${conversationId} nonce=${msgNonce}`,
          );
        } catch (err: any) {
          this.logger.error(`Failed to process chat:message-new: ${err.message}`);
        }
      }

      if (channel === 'outbound:command') {
        try {
          if (!this.server) return;
          const { agentId, conversationId, command, reason } = JSON.parse(message);
          const agent = await this.agentModel
            .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
            .lean()
            .exec();

          // AgentGateway only handles engineer agents
          if ((agent as any)?.type !== 'engineer') return;

          const agentSocketIds = await this.presenceService.getAgentSocketIds(agentId);
          this.logger.log(
            `[outbound:command] /${command} agentId=${agentId} socketIds=${JSON.stringify(agentSocketIds)}`,
          );
          if (agentSocketIds.length > 0) {
            this.server.in(agentSocketIds).emit('agent:command', { type: command, conversationId, reason });
            this.logger.log(`[outbound:command] emitted agent:command → sockets=${agentSocketIds.length}`);
          } else {
            this.logger.warn(`[outbound:command] /${command} — agent ${agentId} not connected`);
          }
        } catch (err: any) {
          this.logger.error(`Failed to process outbound:command: ${err.message}`);
        }
      }
    });
  }

  async onModuleDestroy() {
    this.redisSub?.disconnect();
    this.redisPub?.disconnect();
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '') ||
        client.handshake.query?.token;

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const isAgent = payload.type === 'agent' || !!payload.agentId;

      if (!isAgent) {
        this.logger.warn(`[WS-CONNECT] Non-agent client rejected on /ws/agent socketId=${client.id}`);
        client.disconnect();
        return;
      }

      const agentId = payload.agentId || payload.sub;
      const agent = await this.agentModel
        .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
        .lean()
        .exec();

      if (!agent || (agent as any).type !== 'engineer') {
        this.logger.warn(`[WS-CONNECT] Only engineer agents may connect to /ws/agent agentId=${agentId}`);
        client.disconnect();
        return;
      }

      client.data.type = 'agent';
      client.data.agentId = agentId;
      client.data.orgId = payload.orgId;
      client.data.userId = null;
      client.data.roles = payload.roles || [];
      client.data.token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '') ||
        (client.handshake.query?.token as string) ||
        '';

      await this.presenceService.setAgentOnline(agentId, client.id);
      await this.presenceService.setSocketSession(client.id, {
        type: 'agent',
        actorId: agentId,
        conversationId: '',
        connectedAt: new Date().toISOString(),
      });

      // Auto-rejoin active conversation rooms
      try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const activeConvs = await this.conversationModel
          .find({ agentId, status: 'active', isDeleted: false, updatedAt: { $gte: cutoff } })
          .lean()
          .exec();
        for (const conv of activeConvs) {
          const convId = (conv as any)._id.toString();
          client.join(`conversation:${convId}`);
          await this.presenceService.updateSocketConversation(client.id, convId);
          await this.presenceService.addSocketToConversation(convId, client.id);
        }
        if (activeConvs.length > 0) {
          this.logger.log(
            `[WS-CONNECT] Agent ${agentId} rejoined ${activeConvs.length} active conversation room(s)`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `[WS-CONNECT] Failed to rejoin rooms for agent ${agentId}: ${(err as Error).message}`,
        );
      }

      client.data.agentStatus = null;
      this.logger.log(`[WS-CONNECT] Engineer agent connected | socketId=${client.id} | agentId=${agentId}`);
      this.appendLog(agentId, 'info', 'Agent connected to gateway', { socketId: client.id });

      this.server.emit('presence:update', {
        type: 'agent',
        agentId,
        status: 'online',
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(
        `Authentication failed for client ${client.id}: ${(error as Error).message}`,
      );
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    if (client.data.type === 'agent' && client.data.agentId) {
      const agentId: string = client.data.agentId;
      const conversationId: string = client.data.conversationId;
      await this.presenceService.setAgentOffline(agentId, client.id);
      await this.presenceService.clearAgentStatus(agentId);
      await this.presenceService.removeSocketSession(client.id, conversationId);
      this.logger.debug(
        `[WS-DISCONNECT] Agent disconnected | socketId=${client.id} | agentId=${agentId}`,
      );
      this.appendLog(agentId, 'info', 'Agent disconnected from gateway', { socketId: client.id });
      this.server.emit('presence:update', {
        type: 'agent',
        agentId,
        status: 'offline',
        timestamp: new Date(),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Event: agent:heartbeat
  // ---------------------------------------------------------------------------

  @SubscribeMessage('agent:heartbeat')
  async handleHeartbeat(
    @MessageBody()
    data: {
      status: 'idle' | 'busy' | 'sleep';
      mcpConnected?: boolean;
      availableFunctions?: string[];
      metrics?: Record<string, unknown>;
      sleep?: { reason: string; since: string; until?: string };
    },
    @ConnectedSocket() client: Socket,
  ) {
    if (client.data.type !== 'agent') {
      return { success: false, error: 'agent:heartbeat is only for agent clients' };
    }

    try {
      const { agentId } = client.data;
      let { token } = client.data;
      client.data.lastHeartbeatAt = Date.now();

      // Refresh token if expired or expiring within 1 hour
      let refreshedToken: string | undefined;
      try {
        const payloadB64 = token?.split('.')[1];
        if (payloadB64) {
          const { exp } = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));
          const remainingSec = typeof exp === 'number' ? exp - Math.floor(Date.now() / 1000) : Infinity;
          if (remainingSec < 3600) {
            refreshedToken = this._refreshAgentToken(agentId, client.data.orgId, client.data.roles, client.data.agentStatus ?? 'idle');
            client.data.token = refreshedToken;
            token = refreshedToken;
            this.logger.log(`[heartbeat] token refreshed agentId=${agentId} (was expiring in ${Math.round(remainingSec / 60)}m)`);
          }
        }
      } catch {
        // non-critical — proceed with existing token
      }

      const presenceSockets = await this.presenceService.getAgentSocketIds(agentId);
      this.logger.debug(
        `[heartbeat] agentId=${agentId} socketId=${client.id} presence=${JSON.stringify(presenceSockets)} mcpConnected=${data.mcpConnected ?? 'n/a'} availableFunctions=${data.availableFunctions?.length ?? 'n/a'}`,
      );

      const resolvedStatus = data.status === 'sleep' ? 'idle' : data.status;
      await this.presenceService.setAgentStatus(agentId, {
        status: resolvedStatus,
        lastHeartbeat: new Date().toISOString(),
        conversationId: client.data.conversationId || '',
        metrics: data.metrics ? JSON.stringify(data.metrics) : undefined,
      });

      if (client.data.agentStatus !== resolvedStatus) {
        const prev = client.data.agentStatus ?? 'unknown';
        client.data.agentStatus = resolvedStatus;
        this.appendLog(agentId, 'info', `Status changed: ${prev} → ${resolvedStatus}`);
      }

      const result = await this.heartbeatService.heartbeat(agentId, data, token);
      return refreshedToken ? { ...result, token: refreshedToken } : result;
    } catch (error) {
      this.logger.error('Error handling agent:heartbeat:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }

  // ---------------------------------------------------------------------------
  // Event: message:send — engineer agent sends a response
  // ---------------------------------------------------------------------------

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @MessageBody()
    dto: {
      conversationId?: string;
      role: string;
      content: string;
      type?: string;
      attachments?: Array<{ type: string; url: string; filename?: string; mimeType?: string; size?: number }>;
      sources?: Array<{ type: string; content: string; score?: number; label?: string; collectionId?: string; url?: string; toolName?: string }>;
      workId?: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    if (client.data.type !== 'agent') {
      return { success: false, error: 'message:send on /ws/agent is only for agent clients' };
    }

    try {
      const conversationId = dto.conversationId || client.data.conversationId;
      if (!conversationId) {
        return { success: false, error: 'No conversationId provided' };
      }

      const agentId: string = client.data.agentId;
      const orgId: string = client.data.orgId || '';

      // Dedup: suppress duplicate message:send from stale sockets within 5s window
      if (this.redisPub) {
        const contentHash = createHash('md5')
          .update(`${conversationId}:${agentId}:${dto.role}:${dto.type ?? 'message'}:${dto.content}`)
          .digest('hex')
          .substring(0, 16);
        const dedupKey = `dedup:msg-send:${agentId}:${contentHash}`;
        const acquired = await this.redisPub.set(dedupKey, '1', 'EX', 5, 'NX');
        if (acquired !== 'OK') {
          this.logger.warn(
            `[WS-MSG-SEND] Duplicate suppressed socketId=${client.id} agentId=${agentId} conversationId=${conversationId} type=${dto.type ?? 'message'}`,
          );
          client.emit('message:sent', { success: true, messageId: 'dedup', timestamp: new Date() });
          return { success: true };
        }
      }

      const actionTypeMap: Record<string, ActionType> = {
        system: ActionType.NOTICE,
        tool_use: ActionType.TOOL_USE,
        tool_result: ActionType.TOOL_RESULT,
        thinking: ActionType.THINKING,
      };
      const actionType = actionTypeMap[dto.type ?? ''] ?? ActionType.MESSAGE;

      const actorId = agentId;
      const savedAction = await this.actionModel.create({
        conversationId,
        type: actionType,
        actor: { role: ActorRole.AGENT, agentId, displayName: agentId },
        content: dto.content,
        ...(dto.attachments?.length || dto.sources?.length
          ? {
              metadata: {
                ...(dto.attachments?.length ? { attachments: dto.attachments } : {}),
                ...(dto.sources?.length ? { sources: dto.sources } : {}),
              },
            }
          : {}),
        ...(dto.workId ? { workId: dto.workId } : {}),
        owner: { orgId, agentId, userId: '', groupId: '', appId: '' },
        createdBy: actorId,
        updatedBy: actorId,
      });
      const actionId = (savedAction as any)._id?.toString() || 'unknown';

      // Update conversation metadata
      const now = new Date();
      await this.conversationModel.updateOne(
        { _id: new Types.ObjectId(conversationId) },
        {
          $set: { lastMessage: dto.content, lastMessageAt: now, lastMessageRole: ActorRole.AGENT },
          $inc: { totalMessages: 1 },
        },
      );

      // Publish to ChatGateway via Redis so user on /ws/chat receives the response
      if (this.redisPub) {
        await this.redisPub.publish(
          `chat:response:${conversationId}`,
          JSON.stringify({
            taskId: actionId,
            agentId,
            conversationId,
            orgId,
            type: dto.type ?? 'message',
            role: dto.role,
            content: dto.content,
            ...(dto.sources?.length ? { sources: dto.sources } : {}),
            ...(dto.workId ? { workId: dto.workId } : {}),
            isFinal: dto.role === 'assistant',
          }),
        );
      }

      // Bridge to Connection Worker (Discord/Telegram outbound) if final assistant message
      if (dto.role === 'assistant' && this.redisPub) {
        const outboundLockKey = `lock:outbound:${actionId}`;
        this.redisPub.set(outboundLockKey, '1', 'EX', 10, 'NX').then((acquired) => {
          if (acquired && this.redisPub) {
            this.redisPub
              .publish(
                'outbound:message',
                JSON.stringify({
                  conversationId,
                  text: dto.content,
                  actionType: dto.type === 'system' ? 'notice' : (dto.type ?? 'message'),
                }),
              )
              .catch((err: Error) =>
                this.logger.error(`Failed to publish outbound:message: ${err.message}`),
              );
          }
        }).catch((err: Error) =>
          this.logger.error(`Failed to acquire outbound lock: ${err.message}`),
        );
      }

      this.logger.log(
        `[WS-MSG-SEND] actionId=${actionId} agentId=${agentId} conversationId=${conversationId} type=${dto.type ?? 'message'}`,
      );

      client.emit('message:sent', { success: true, messageId: actionId, timestamp: new Date() });
      return { success: true };
    } catch (error) {
      this.logger.error('Error sending message:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }

  // ---------------------------------------------------------------------------
  // Event: channel:send — proactive message to a platform channel
  // ---------------------------------------------------------------------------

  @SubscribeMessage('channel:send')
  async handleChannelSend(
    @MessageBody()
    dto: {
      connectionId: string;
      channelId: string;
      content?: string;
      embed?: {
        title?: string;
        description?: string;
        color?: number;
        url?: string;
        imageUrl?: string;
        footer?: string;
        fields?: Array<{ name: string; value: string; inline?: boolean }>;
      };
      file?: {
        fileUrl: string;
        filename?: string;
        mimeType?: string;
        caption?: string;
      };
      conversationId?: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    if (client.data.type !== 'agent') {
      return { success: false, error: 'channel:send is only available for agent clients' };
    }

    const { connectionId, channelId, content, embed, file, conversationId } = dto;

    if (!connectionId || !channelId || (!content && !embed && !file)) {
      return {
        success: false,
        error: 'connectionId, channelId and one of content, embed, or file are required',
      };
    }

    if (file && !file.fileUrl) {
      return {
        success: false,
        error: 'file.fileUrl is required — upload the file first via POST /files/upload',
      };
    }

    if (!this.redisPub) {
      return { success: false, error: 'Internal error: Redis not available' };
    }

    try {
      await this.redisPub.publish(
        'outbound:direct',
        JSON.stringify({
          connectionId,
          channelId,
          content,
          embed,
          file,
          conversationId: conversationId || null,
        }),
      );

      this.logger.log(
        `[WS-CHANNEL-SEND] agentId=${client.data.agentId} connectionId=${connectionId} channelId=${channelId} type=${file ? 'file' : embed ? 'embed' : 'text'}`,
      );

      return { success: true, connectionId, channelId };
    } catch (err: any) {
      this.logger.error(`channel:send failed: ${err.message}`);
      return { success: false, error: `Failed to send: ${err.message}` };
    }
  }

  private appendLog(
    agentId: string,
    level: 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const entry: Record<string, unknown> = { level, message, time: new Date() };
    if (data) entry.data = data;
    this.agentModel
      .updateOne(
        { _id: new Types.ObjectId(agentId) },
        { $push: { logs: { $each: [entry], $slice: -100 } } },
      )
      .exec()
      .catch((err: Error) => this.logger.warn(`appendLog failed for ${agentId}: ${err.message}`));
  }

  private _refreshAgentToken(agentId: string, orgId: string, roles: string[], status: string): string {
    return this.jwtService.sign(
      { sub: agentId, username: `agent:${agentId}`, status, roles, orgId, groupId: '', agentId, userId: '', type: 'agent' },
      { expiresIn: '24h' },
    );
  }
}
