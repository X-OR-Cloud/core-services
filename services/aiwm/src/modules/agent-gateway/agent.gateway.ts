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
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { redisConfig } from '../../config/redis.config';
import { ChatService } from '../chat/chat.service';
import { ConversationService } from '../conversation/conversation.service';
import { AgentService } from '../agent/agent.service';
import { ActionService } from '../action/action.service';
import { ActionType, ActorRole } from '../action/action.enum';

@WebSocketGateway({
  namespace: '/ws/agent',
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
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly conversationService: ConversationService,
    private readonly agentService: AgentService,
    private readonly actionService: ActionService,
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

    this.redisSub = new Redis(redisConfig);
    this.redisPub = new Redis(redisConfig);

    await this.redisSub.subscribe('agent:join-room', 'chat:message-new', 'outbound:command');

    this.redisSub.on('message', async (channel, message) => {
      if (channel === 'agent:join-room') {
        try {
          const { agentId, conversationId } = JSON.parse(message);
          if (!this.server) return;
          const agentSocketIds = await this.chatService.getAgentSocketIds(agentId);
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

          const agentDoc = agentId ? await this.agentService.findByIdInternal(agentId) : null;

          // Only handle engineer agents — assistant agents are routed by ChatGateway via chat:task
          if ((agentDoc as any)?.type !== 'engineer') return;

          if (!skipAgent && agentDoc?.status === 'sleep') {
            skipAgent = true;
          }

          // Ensure agent sockets are in the conversation room, then broadcast message:new
          if (!skipAgent && agentId) {
            const agentSocketIds = await this.chatService.getAgentSocketIds(agentId);
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
          const agent = await this.agentService.findByIdInternal(agentId);

          // AgentGateway only handles engineer agents
          if (agent?.type !== 'engineer') return;

          const agentSocketIds = await this.chatService.getAgentSocketIds(agentId);
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
      const agent = await this.agentService.findByIdInternal(agentId);

      if (!agent || agent.type !== 'engineer') {
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

      await this.chatService.setAgentOnline(agentId, client.id);
      await this.chatService.setSocketSession(client.id, {
        type: 'agent',
        actorId: agentId,
        conversationId: '',
        connectedAt: new Date().toISOString(),
      });

      // Auto-rejoin active conversation rooms
      try {
        const activeConvs = await this.conversationService.findActiveByAgent(agentId);
        for (const conv of activeConvs) {
          const convId = (conv as any)._id.toString();
          client.join(`conversation:${convId}`);
          await this.chatService.updateSocketConversation(client.id, convId);
          await this.chatService.addSocketToConversation(convId, client.id);
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

      this.logger.log(`[WS-CONNECT] Engineer agent connected | socketId=${client.id} | agentId=${agentId}`);

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
      await this.chatService.setAgentOffline(agentId, client.id);
      await this.chatService.clearAgentStatus(agentId);
      await this.chatService.removeSocketSession(client.id, conversationId);
      this.logger.debug(
        `[WS-DISCONNECT] Agent disconnected | socketId=${client.id} | agentId=${agentId}`,
      );
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
      const { agentId, token } = client.data;
      client.data.lastHeartbeatAt = Date.now();

      const presenceSockets = await this.chatService.getAgentSocketIds(agentId);
      this.logger.debug(
        `[heartbeat] agentId=${agentId} socketId=${client.id} presence=${JSON.stringify(presenceSockets)} mcpConnected=${data.mcpConnected ?? 'n/a'} availableFunctions=${data.availableFunctions?.length ?? 'n/a'}`,
      );

      await this.chatService.setAgentStatus(agentId, {
        status: data.status === 'sleep' ? 'idle' : data.status,
        lastHeartbeat: new Date().toISOString(),
        conversationId: client.data.conversationId || '',
        metrics: data.metrics ? JSON.stringify(data.metrics) : undefined,
      });

      return await this.agentService.heartbeat(agentId, data, token);
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

      const actionTypeMap: Record<string, ActionType> = {
        system: ActionType.NOTICE,
        tool_use: ActionType.TOOL_USE,
        tool_result: ActionType.TOOL_RESULT,
        thinking: ActionType.THINKING,
      };
      const actionType = actionTypeMap[dto.type ?? ''] ?? ActionType.MESSAGE;

      const savedAction = await this.actionService.createActionDirect(
        {
          conversationId,
          type: actionType,
          actor: { role: ActorRole.AGENT, agentId, displayName: agentId },
          content: dto.content,
          metadata:
            dto.attachments?.length || dto.sources?.length
              ? {
                  ...(dto.attachments?.length ? { attachments: dto.attachments } : {}),
                  ...(dto.sources?.length ? { sources: dto.sources } : {}),
                }
              : undefined,
          ...(dto.workId ? { workId: dto.workId } : {}),
        } as any,
        { orgId, agentId, userId: '' },
      );
      const actionId = (savedAction as any)._id?.toString() || 'unknown';

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
}
