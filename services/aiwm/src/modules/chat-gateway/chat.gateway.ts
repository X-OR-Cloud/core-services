import * as crypto from 'crypto';
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
import { Logger, OnModuleInit, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { buildRedisConfig } from '../../config/redis.config';
import { ChatService } from '../chat/chat.service';
import { ConversationService } from '../conversation/conversation.service';
import { HeartbeatService } from '../heartbeat/heartbeat.service';
import { ActionService } from '../action/action.service';
import { ActionType, ActorRole } from '../action/action.enum';
import { Agent, AgentDocument } from '../agent/agent.schema';

@WebSocketGateway({ namespace: '/' })
export class ChatWsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatWsGateway.name);
  private redisSub: Redis | null = null;
  private redisPub: Redis | null = null;

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly conversationService: ConversationService,
    private readonly heartbeatService: HeartbeatService,
    private readonly actionService: ActionService,
    @InjectModel(Agent.name) private readonly agentModel: Model<AgentDocument>,
  ) {}

  afterInit(_server: Server) {
    this.logger.log('Chat WebSocket Gateway (CWS) initialized');
  }

  async onModuleInit() {
    const mode = process.env.MODE || 'api';
    if (mode !== 'cws') {
      this.logger.log(`Skipping Redis subscriptions in MODE=${mode}`);
      return;
    }

    this.redisSub = new Redis(buildRedisConfig());
    this.redisPub = new Redis(buildRedisConfig());

    await this.redisSub.subscribe('agent:join-room', 'chat:message-new');
    await this.redisSub.psubscribe('chat:response:*');

    this.redisSub.on('pmessage', async (_pattern, channel, message) => {
      if (!channel.startsWith('chat:response:')) return;
      const conversationId = channel.slice('chat:response:'.length);
      try {
        const payload = JSON.parse(message) as {
          taskId: string;
          agentId: string;
          conversationId: string;
          orgId?: string;
          type: string;
          role: string;
          content: string;
          sources?: unknown[];
          workId?: string;
          isTyping?: boolean;
          isFinal?: boolean;
          nonce?: string;
        };

        if (payload.type === 'typing') {
          this.logger.debug(`[typing] conv=${conversationId} isTyping=${payload.isTyping} agentId=${payload.agentId}`);
          this.server.to(`conversation:${conversationId}`).emit('agent:typing', {
            agentId: payload.agentId,
            conversationId,
            isTyping: payload.isTyping ?? false,
            timestamp: new Date(),
          });
          return;
        }

        if (payload.nonce && this.redisPub) {
          const lockKey = `lock:chat-resp:${payload.nonce}`;
          const acquired = await this.redisPub.set(lockKey, '1', 'EX', 10, 'NX');
          if (!acquired) {
            this.logger.debug(`[Redis] chat:response skipped (lock taken) nonce=${payload.nonce}`);
            return;
          }
        }

        const actionTypeMap: Record<string, ActionType> = {
          message: ActionType.MESSAGE,
          system: ActionType.NOTICE,
          tool_use: ActionType.TOOL_USE,
          tool_result: ActionType.TOOL_RESULT,
          thinking: ActionType.THINKING,
          error: ActionType.ERROR,
        };
        const actionType = actionTypeMap[payload.type] ?? ActionType.MESSAGE;
        const t0 = Date.now();
        const savedAction = await this.actionService.createActionDirect(
          {
            conversationId,
            type: actionType,
            actor: { role: ActorRole.AGENT, agentId: payload.agentId, displayName: payload.agentId },
            content: payload.content || '',
            ...(payload.sources?.length ? { sources: payload.sources } : {}),
            ...(payload.workId ? { workId: payload.workId } : {}),
          } as any,
          { orgId: payload.orgId || '', agentId: payload.agentId, userId: '' },
        );
        const actionId = (savedAction as any)._id?.toString() || 'unknown';
        const dbSaveMs = Date.now() - t0;

        this.server.to(`conversation:${conversationId}`).emit('message:new', {
          _id: actionId,
          conversationId,
          role: 'assistant',
          type: payload.type,
          content: payload.content,
          agentId: payload.agentId,
          platform: 'portal',
          isFinal: payload.isFinal ?? false,
          ...(payload.sources?.length ? { sources: payload.sources } : {}),
          ...(payload.workId ? { workId: payload.workId } : {}),
        });
        this.logger.debug(`[timing] response taskId=${payload.taskId} conv=${conversationId} db_save=${dbSaveMs}ms broadcast_total=${Date.now() - t0}ms`);

        if (payload.isFinal && payload.role === 'assistant' && this.redisPub) {
          const outboundLockKey = `lock:outbound:${actionId}`;
          this.redisPub.set(outboundLockKey, '1', 'EX', 10, 'NX').then((acquired) => {
            if (acquired && this.redisPub) {
              this.redisPub.publish(
                'outbound:message',
                JSON.stringify({
                  conversationId,
                  text: payload.content,
                  actionType: payload.type === 'system' ? 'notice' : (payload.type ?? 'message'),
                }),
              ).catch((err: Error) => this.logger.error(`Failed to publish outbound:message: ${err.message}`));
            }
          }).catch((err: Error) => this.logger.error(`Failed to acquire outbound lock: ${err.message}`));
        }

        this.logger.debug(`[Redis] chat:response actionId=${actionId} conv=${conversationId} type=${payload.type}`);
      } catch (err: any) {
        this.logger.error(`Failed to process chat:response for ${conversationId}: ${err.message}`);
      }
    });

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
            actionId, conversationId, agentId, orgId, role, content, attachments,
            userId, username, fullname, externalUsername, externalUserId,
            channelId, connectionId, platform, msgNonce,
          } = parsed;
          let { skipAgent } = parsed;

          const lockKey = `lock:chat-msg:${msgNonce}`;
          const acquired = await this.redisPub!.set(lockKey, '1', 'EX', 10, 'NX');
          if (!acquired) {
            this.logger.debug(`[Redis] chat:message-new skipped (lock taken) nonce=${msgNonce}`);
            return;
          }

          const agentDoc = agentId ? await this.agentModel.findOne({ _id: agentId, isDeleted: false }).lean() : null;
          if (!skipAgent && (agentDoc as any)?.status === 'sleep') {
            skipAgent = true;
            const sleepReason: string = (agentDoc as any).sleepReason || 'agent is sleeping';
            const noticeContent = `⚠️ Agent đang tạm nghỉ (${sleepReason}). Tin nhắn đã được ghi nhận nhưng agent sẽ không phản hồi cho đến khi được đánh thức.`;
            try {
              await this.actionService.createActionDirect(
                {
                  conversationId,
                  type: ActionType.NOTICE,
                  actor: { role: ActorRole.AGENT, agentId, displayName: agentId },
                  content: noticeContent,
                  metadata: { skipAgent: true },
                },
                { orgId: orgId || '', agentId, userId: userId || '' },
              );
            } catch (noticeErr: any) {
              this.logger.warn(`Failed to persist sleep notice (redis path): ${noticeErr.message}`);
            }
            this.server.to(`conversation:${conversationId}`).emit('message:new', {
              _id: `sleep-notice-${actionId}`,
              conversationId,
              role: 'assistant',
              type: 'system',
              content: noticeContent,
              platform: 'portal',
              skipAgent: true,
            });
            if (this.redisPub) {
              const outboundLockKey = `lock:outbound:sleep-${actionId}`;
              this.redisPub.set(outboundLockKey, '1', 'EX', 10, 'NX').then((acquired) => {
                if (acquired && this.redisPub) {
                  this.redisPub.publish(
                    'outbound:message',
                    JSON.stringify({ conversationId, text: noticeContent, actionType: 'notice' }),
                  ).catch((err: Error) =>
                    this.logger.error(`Failed to publish sleep notice outbound: ${err.message}`),
                  );
                }
              }).catch((err: Error) =>
                this.logger.error(`Failed to acquire outbound lock for sleep notice: ${err.message}`),
              );
            }
            this.logger.warn(
              `[Redis] Agent ${agentId} is sleeping — skipping routing. reason="${sleepReason}"`,
            );
          }

          const broadcastPayload = {
            _id: actionId, conversationId, orgId, role, content, attachments,
            userId, username, fullname, externalUsername, externalUserId,
            channelId, connectionId, platform,
            ...(skipAgent ? { skipAgent: true } : {}),
          };
          this.server.to(`conversation:${conversationId}`).emit('message:new', broadcastPayload);

          if (!skipAgent && agentId) {
            if ((agentDoc as any)?.type === 'assistant') {
              const task = {
                taskId: actionId, agentId, conversationId, actionId, content, role,
                orgId: orgId || '', userId, username, fullname, externalUsername, externalUserId,
                channelId, connectionId, attachments, platform,
                timestamp: new Date().toISOString(),
              };
              this.redisPub!.lpush(`chat:task:${agentId}`, JSON.stringify(task)).catch((err: Error) =>
                this.logger.error(`Failed to push task from con worker: ${err.message}`),
              );
              this.logger.debug(`[Redis] chat:task:${agentId} pushed from con-worker taskId=${actionId}`);
            } else {
              const agentSocketIds = await this.chatService.getAgentSocketIds(agentId);
              if (agentSocketIds.length > 0) {
                this.server.in(agentSocketIds).socketsJoin(`conversation:${conversationId}`);
              }
            }
          }
          this.logger.debug(
            `[Redis] chat:message-new processed conversationId=${conversationId} role=${role}`,
          );
        } catch (err: any) {
          this.logger.error(`Failed to process chat:message-new: ${err.message}`);
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

      let payload: any;
      let isExternalSigned = false;
      try {
        payload = this.jwtService.verify(token);
      } catch {
        const decoded = this.jwtService.decode(token) as Record<string, any> | null;
        if (decoded?.type === 'anonymous' && decoded?.agentId) {
          payload = await this._verifyExternalSignedToken(decoded.agentId, token);
          isExternalSigned = true;
        } else {
          throw new Error('Token verification failed and not a valid external-signed anonymous token');
        }
      }

      const isAnonymous = payload.type === 'anonymous';
      const isAgent = !isAnonymous && (payload.type === 'agent' || !!payload.agentId);

      if (isAnonymous) {
        await this._handleAnonymousConnect(client, payload, isExternalSigned);
      } else if (isAgent) {
        await this._handleAgentConnect(client, payload);
      } else {
        await this._handleUserConnect(client, payload);
      }
    } catch (error) {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '') ||
        client.handshake.query?.token;
      let agentInfo = '';
      if (token) {
        try {
          const decoded = this.jwtService.decode(token) as Record<string, any>;
          if (decoded) {
            const id = decoded.sub || decoded.agentId || decoded.anonymousId;
            const code = decoded.code;
            agentInfo = ` [sub=${id}${code ? ` code=${code}` : ''} type=${decoded.type ?? 'user'}]`;
          }
        } catch {
          // ignore
        }
      }
      this.logger.error(
        `Authentication failed for client ${client.id}${agentInfo}: ${(error as Error).message}`,
      );
      client.disconnect();
    }
  }

  private async _handleAgentConnect(client: Socket, payload: any) {
    const agentId = payload.agentId || payload.sub;

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

    try {
      const activeConvs = await this.conversationService.findActiveByAgent(agentId);
      for (const conv of activeConvs) {
        const convId = (conv as any)._id.toString();
        client.join(`conversation:${convId}`);
        await this.chatService.updateSocketConversation(client.id, convId);
        await this.chatService.addSocketToConversation(convId, client.id);
        this.server.to(`conversation:${convId}`).emit('presence:update', {
          type: 'agent',
          agentId,
          status: 'online',
          timestamp: new Date(),
        });
      }
      if (activeConvs.length > 0) {
        this.logger.log(
          `[WS-CONNECT] Agent ${agentId} rejoined ${activeConvs.length} active conversation room(s)`,
        );
      }
    } catch (err) {
      this.logger.warn(`[WS-CONNECT] Failed to rejoin rooms for agent ${agentId}: ${(err as Error).message}`);
    }

    this.logger.log(`[WS-CONNECT] Agent connected | socketId=${client.id} | agentId=${agentId}`);
  }

  private async _handleAnonymousConnect(client: Socket, payload: any, isExternalSigned = false) {
    const { anonymousId, agentId, orgId, tokenId } = payload;

    if (!isExternalSigned && tokenId) {
      const isValid = await this._validateAndTouchAnonymousToken(agentId, tokenId);
      if (!isValid) {
        this.logger.warn(`Anonymous token ${tokenId} is revoked or not found, rejecting client ${client.id}`);
        client.disconnect();
        return;
      }
    }

    const agent = await this.agentModel.findOne({ _id: agentId, isDeleted: false }).lean();
    const resolvedOrgId = orgId || (agent as any)?.owner?.orgId || '';

    client.data.type = 'anonymous';
    client.data.userId = anonymousId;
    client.data.agentId = agentId;
    client.data.orgId = resolvedOrgId;
    client.data.roles = [];
    client.data.agentType = (agent as any)?.type ?? 'engineer';

    await this.chatService.setUserOnline(anonymousId, client.id);
    await this.chatService.setSocketSession(client.id, {
      type: 'anonymous',
      actorId: anonymousId,
      conversationId: '',
      connectedAt: new Date().toISOString(),
    });

    const conversationMode = (agent as any)?.conversationMode ?? 'per-user';
    const sessionTimeoutMs = (agent as any)?.sessionTimeoutMs ?? 1800000;
    const conversation = await this.conversationService.resolveConversation({
      orgId: resolvedOrgId,
      agentId,
      userId: anonymousId,
      mode: conversationMode,
      sessionTimeoutMs,
      userType: 'anonymous',
    });
    const conversationId = (conversation as any)._id.toString();

    await this._joinConversationRoom(client, conversationId, agentId);

    this.logger.log(
      `[WS-CONNECT] Anonymous connected | socketId=${client.id} | anonymousId=${anonymousId} | conversationId=${conversationId}`,
    );

    client.emit('presence:update', {
      type: 'anonymous',
      userId: anonymousId,
      agentId,
      conversationId,
      status: 'online',
      timestamp: new Date(),
    });
  }

  private async _handleUserConnect(client: Socket, payload: any) {
    const userId = payload.sub || payload.userId;

    client.data.type = 'user';
    client.data.userId = userId;
    client.data.username = payload.username;
    client.data.fullname = payload.fullname;
    client.data.agentId = null;
    client.data.orgId = payload.orgId;
    client.data.roles = payload.roles || [];

    await this.chatService.setUserOnline(userId, client.id);
    await this.chatService.setSocketSession(client.id, {
      type: 'user',
      actorId: userId,
      conversationId: '',
      connectedAt: new Date().toISOString(),
    });

    this.logger.log(`[WS-CONNECT] User connected | socketId=${client.id} | userId=${userId}`);

    client.emit('presence:update', {
      type: 'user',
      userId,
      status: 'online',
      timestamp: new Date(),
    });
  }

  private async _joinConversationRoom(client: Socket, conversationId: string, agentId: string) {
    await client.join(`conversation:${conversationId}`);
    client.data.conversationId = conversationId;
    client.data.agentId = agentId;

    if (!client.data.agentType && agentId) {
      try {
        const agent = await this.agentModel.findOne({ _id: agentId, isDeleted: false }).lean();
        client.data.agentType = (agent as any)?.type ?? 'engineer';
      } catch {
        client.data.agentType = 'engineer';
      }
    }

    const participantId = client.data.userId || client.data.agentId;
    await this.chatService.joinConversation(conversationId, participantId);
    await this.chatService.updateSocketConversation(client.id, conversationId);
    await this.chatService.addSocketToConversation(conversationId, client.id);

    const agentSocketIds = await this.chatService.getAgentSocketIds(agentId);
    if (agentSocketIds.length > 0) {
      this.server.in(agentSocketIds).socketsJoin(`conversation:${conversationId}`);
      this.logger.debug(
        `[WS-JOIN] Agent socketsJoin | agentId=${agentId} | conversationId=${conversationId} | sockets=${agentSocketIds.length}`,
      );
      client.emit('presence:update', {
        type: 'agent',
        agentId,
        status: 'online',
        timestamp: new Date(),
      });
    }

    let roomSize = 0;
    try {
      roomSize = this.server?.sockets?.adapter?.rooms?.get(`conversation:${conversationId}`)?.size || 0;
    } catch { /* adapter not ready */ }

    this.logger.log(
      `[WS-JOIN] Joined room | type=${client.data.type} | id=${participantId} | conversationId=${conversationId} | roomSize=${roomSize}`,
    );
  }

  async handleDisconnect(client: Socket) {
    const conversationId = client.data.conversationId;

    if (client.data.type === 'agent' && client.data.agentId) {
      await this.chatService.setAgentOffline(client.data.agentId, client.id);
      await this.chatService.clearAgentStatus(client.data.agentId);
      await this.chatService.removeSocketSession(client.id, conversationId);
      this.logger.debug(
        `[WS-DISCONNECT] Agent disconnected | socketId=${client.id} | agentId=${client.data.agentId}`,
      );
      if (conversationId) {
        this.server.to(`conversation:${conversationId}`).emit('presence:update', {
          type: 'agent',
          agentId: client.data.agentId,
          status: 'offline',
          timestamp: new Date(),
        });
      }
    } else if (client.data.userId) {
      await this.chatService.setUserOffline(client.data.userId, client.id);
      await this.chatService.removeSocketSession(client.id, conversationId);
      this.logger.debug(
        `[WS-DISCONNECT] ${client.data.type} disconnected | socketId=${client.id} | userId=${client.data.userId}`,
      );
      if (conversationId) {
        this.server.to(`conversation:${conversationId}`).emit('presence:update', {
          type: client.data.type,
          userId: client.data.userId,
          status: 'offline',
          timestamp: new Date(),
        });
      }
    }
  }

  @SubscribeMessage('agent:connect')
  async handleAgentConnect(
    @MessageBody() data: { agentId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      if (client.data.type !== 'user') {
        return { success: false, error: 'Only authenticated users can emit agent:connect' };
      }

      const { agentId } = data;
      const { userId, orgId } = client.data;

      const conversation = await this.conversationService.findOrCreateForUser(
        userId,
        agentId,
        orgId,
        'authenticated',
      );
      const conversationId = (conversation as any)._id.toString();

      await this._joinConversationRoom(client, conversationId, agentId);

      client.to(`conversation:${conversationId}`).emit('user:joined', {
        type: 'user',
        userId,
        conversationId,
        timestamp: new Date(),
      });

      return { success: true, conversationId };
    } catch (error) {
      this.logger.error('Error handling agent:connect:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }

  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      if (client.data.type === 'anonymous') {
        return { success: false, error: 'Anonymous clients cannot join conversations manually. Use the conversation assigned on connect.' };
      }

      const { conversationId } = data;

      const conversation = await this.conversationService.findById(
        conversationId as any,
        { userId: client.data.userId || '', roles: client.data.roles || [], orgId: client.data.orgId, groupId: '', agentId: '', appId: '' },
      );

      if (!conversation) {
        return { success: false, error: `Conversation ${conversationId} not found` };
      }

      const agentId = (conversation as any).agentId;

      await this._joinConversationRoom(client, conversationId, agentId);

      client.to(`conversation:${conversationId}`).emit('user:joined', {
        type: client.data.type,
        userId: client.data.userId,
        agentId: client.data.agentId,
        conversationId,
        timestamp: new Date(),
      });

      return { success: true, conversationId };
    } catch (error) {
      this.logger.error('Error joining conversation:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }

  @SubscribeMessage('conversation:leave')
  async handleLeaveConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { conversationId } = data;

      await client.leave(`conversation:${conversationId}`);
      client.data.conversationId = null;

      await this.chatService.leaveConversation(
        conversationId,
        client.data.userId || client.data.agentId,
      );
      await this.chatService.removeSocketFromConversation(conversationId, client.id);
      await this.chatService.updateSocketConversation(client.id, '');

      let roomSize = 0;
      try {
        roomSize = this.server?.sockets?.adapter?.rooms?.get(`conversation:${conversationId}`)?.size || 0;
      } catch { /* adapter not ready */ }

      const participantId = client.data.userId || client.data.agentId;
      this.logger.log(
        `[WS-LEAVE] ${client.data.type} left | id=${participantId} | conversationId=${conversationId} | roomSize=${roomSize}`,
      );

      client.to(`conversation:${conversationId}`).emit('user:left', {
        type: client.data.type,
        userId: client.data.userId,
        agentId: client.data.agentId,
        conversationId,
        timestamp: new Date(),
      });

      return { success: true, conversationId };
    } catch (error) {
      this.logger.error('Error leaving conversation:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @MessageBody() dto: {
      conversationId?: string;
      role: string;
      content: string;
      type?: string;
      attachments?: Array<{ type: string; url: string; filename?: string; mimeType?: string; size?: number }>;
      references?: Array<{ app?: string; page?: string; section?: string; resourceType: string; resourceId?: string; content?: string; label: string }>;
      sources?: Array<{ type: string; content: string; score?: number; label?: string; collectionId?: string; url?: string; toolName?: string }>;
      workId?: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const conversationId = client.data.type === 'anonymous'
        ? client.data.conversationId
        : (dto.conversationId || client.data.conversationId);

      if (!conversationId) {
        throw new Error('No conversation found. Please emit agent:connect or conversation:join first.');
      }

      if (client.data.type !== 'anonymous' && dto.conversationId && dto.conversationId !== client.data.conversationId) {
        const inRoom = client.rooms.has(`conversation:${dto.conversationId}`);
        if (!inRoom) {
          this.logger.warn(`[WS-MSG-SEND] Rejected — ${client.data.type} ${client.data.userId} not in room conversation:${dto.conversationId}`);
          return { success: false, error: 'You must join the conversation before sending messages.' };
        }
      }

      const IGNORE_PREFIX = '/ignore ';
      let skipAgent = false;
      if (dto.content?.startsWith(IGNORE_PREFIX)) {
        if (client.data.type === 'anonymous') {
          return { success: false, error: 'Anonymous clients cannot use /ignore' };
        }
        const stripped = dto.content.slice(IGNORE_PREFIX.length).trim();
        if (!stripped) {
          return { success: false, error: '/ignore requires a message after the command' };
        }
        dto = { ...dto, content: stripped };
        skipAgent = true;
      }

      const messageDto = { ...dto, conversationId };

      const isAgent = client.data.type === 'agent';
      const orgId: string = client.data.orgId || '';
      const agentId: string = client.data.agentId || '';

      const actionRole = isAgent ? ActorRole.AGENT : ActorRole.USER;
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
          actor: {
            role: actionRole,
            agentId: isAgent ? agentId : undefined,
            userId: isAgent ? undefined : (client.data.userId || undefined),
            displayName: isAgent ? agentId : (client.data.userId || 'user'),
          },
          content: dto.content,
          metadata: (dto.attachments?.length || dto.references?.length || dto.sources?.length || skipAgent)
            ? {
                ...(dto.attachments?.length ? { attachments: dto.attachments } : {}),
                ...(dto.references?.length ? { references: dto.references } : {}),
                ...(dto.sources?.length ? { sources: dto.sources } : {}),
                ...(skipAgent ? { skipAgent: true } : {}),
              }
            : undefined,
          ...(dto.workId ? { workId: dto.workId } : {}),
        },
        { orgId, agentId, userId: client.data.userId || '' },
      );
      const actionId = (savedAction as any)._id?.toString() || 'unknown';

      let roomSize = 0;
      try {
        roomSize = this.server?.sockets?.adapter?.rooms?.get(`conversation:${conversationId}`)?.size || 0;
      } catch { /* adapter not ready */ }

      const contentPreview = dto.content.length > 20 ? dto.content.substring(0, 20) + '...' : dto.content;
      const senderId = client.data.userId || agentId;
      this.logger.log(
        `[WS-MSG-SEND] actionId=${actionId} | ${client.data.type}Id=${senderId} | role=${dto.role} | conversationId=${conversationId} | content="${contentPreview}"`,
      );
      this.logger.debug(
        `[WS-BROADCAST] room=conversation:${conversationId} | roomSize=${roomSize} | actionId=${actionId}`,
      );

      let sleepNoticeContent: string | null = null;
      if (!isAgent && agentId && !skipAgent) {
        try {
          const targetAgent = await this.agentModel.findOne({ _id: agentId, isDeleted: false }).lean();
          if ((targetAgent as any)?.status === 'sleep') {
            skipAgent = true;
            const sleepReason: string = (targetAgent as any).sleepReason || 'agent is sleeping';
            sleepNoticeContent = `⚠️ Agent đang tạm nghỉ (${sleepReason}). Tin nhắn đã được ghi nhận nhưng agent sẽ không phản hồi cho đến khi được đánh thức.`;
            this.logger.warn(
              `[WS-MSG-SEND] Agent ${agentId} is sleeping — skipping routing. reason="${sleepReason}"`,
            );
          }
        } catch (err: any) {
          this.logger.warn(`Failed to check agent sleep status: ${err.message}`);
        }
      }

      const broadcastPayload = {
        ...messageDto,
        _id: actionId,
        platform: 'portal',
        ...(skipAgent ? { skipAgent: true } : {}),
        ...(!isAgent && client.data.userId ? { userId: client.data.userId, username: client.data.username, fullname: client.data.fullname } : {}),
      };

      if (sleepNoticeContent) {
        try {
          await this.actionService.createActionDirect(
            {
              conversationId,
              type: ActionType.NOTICE,
              actor: { role: ActorRole.AGENT, agentId, displayName: agentId },
              content: sleepNoticeContent,
              metadata: { skipAgent: true },
            },
            { orgId, agentId, userId: client.data.userId || '' },
          );
        } catch (noticeErr: any) {
          this.logger.warn(`Failed to persist sleep notice: ${noticeErr.message}`);
        }
        this.server.to(`conversation:${conversationId}`).emit('message:new', {
          _id: `sleep-notice-${actionId}`,
          conversationId,
          role: 'assistant',
          type: 'system',
          content: sleepNoticeContent,
          platform: 'portal',
          skipAgent: true,
        });
      }

      const isAssistantAgent = client.data.agentType === 'assistant';
      if (!isAgent && isAssistantAgent && agentId && !skipAgent && this.redisPub) {
        const queuedAt = Date.now();
        const task = {
          taskId: actionId, agentId, conversationId, actionId,
          content: dto.content, role: dto.role, orgId: client.data.orgId || '',
          userId: client.data.userId || undefined,
          username: client.data.username || undefined,
          fullname: client.data.fullname || undefined,
          attachments: dto.attachments,
          references: dto.references,
          sources: dto.sources,
          workId: dto.workId,
          platform: 'portal',
          timestamp: new Date(queuedAt).toISOString(),
        };
        this.redisPub.lpush(`chat:task:${agentId}`, JSON.stringify(task)).catch((err: Error) =>
          this.logger.error(`Failed to push task to chat:task:${agentId}: ${err.message}`),
        );
        this.logger.debug(`[timing] ws→queue taskId=${actionId} elapsed=${Date.now() - queuedAt}ms`);
        this.server.to(`conversation:${conversationId}`).emit('message:new', broadcastPayload);
      } else {
        this.server.to(`conversation:${conversationId}`).emit('message:new', broadcastPayload);

        if (dto.role === 'assistant' && this.redisPub) {
          const outboundLockKey = `lock:outbound:${actionId}`;
          this.redisPub.set(outboundLockKey, '1', 'EX', 10, 'NX').then((acquired) => {
            if (acquired && this.redisPub) {
              this.redisPub.publish(
                'outbound:message',
                JSON.stringify({ conversationId, text: dto.content, actionType: dto.type === 'system' ? 'notice' : (dto.type ?? 'message') }),
              ).catch((err: Error) =>
                this.logger.error(`Failed to publish outbound:message: ${err.message}`),
              );
            }
          }).catch((err: Error) =>
            this.logger.error(`Failed to acquire outbound lock: ${err.message}`),
          );
        }
      }

      client.emit('message:sent', { success: true, messageId: actionId, timestamp: new Date() });
      return { success: true, message: broadcastPayload };
    } catch (error) {
      this.logger.error('Error sending message:', (error as Error).message);
      client.emit('message:error', { success: false, error: (error as Error).message, timestamp: new Date() });
      return { success: false, error: (error as Error).message };
    }
  }

  @SubscribeMessage('message:typing')
  async handleTyping(
    @MessageBody() data: { conversationId: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const { conversationId, isTyping } = data;
    const isAgent = client.data.type === 'agent';
    const eventName = isAgent ? 'agent:typing' : 'user:typing';

    client.to(`conversation:${conversationId}`).emit(eventName, {
      type: client.data.type,
      userId: client.data.userId,
      agentId: client.data.agentId,
      conversationId,
      isTyping,
      timestamp: new Date(),
    });

    if (isAgent && isTyping && this.redisPub) {
      this.redisPub.publish(
        'outbound:typing',
        JSON.stringify({ conversationId }),
      ).catch((err: Error) =>
        this.logger.error(`Failed to publish outbound:typing: ${err.message}`),
      );
    }

    this.logger.debug(
      `[WS-TYPING] ${eventName} | conversationId=${conversationId} | isTyping=${isTyping}`,
    );

    return { success: true };
  }

  @SubscribeMessage('conversation:online')
  async handleGetOnlineUsers(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() _client: Socket,
  ) {
    try {
      const onlineUsers = await this.chatService.getOnlineUsersInConversation(data.conversationId);
      return { success: true, onlineUsers };
    } catch (error) {
      this.logger.error('Error getting online users:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }

  @SubscribeMessage('agent:heartbeat')
  async handleHeartbeat(
    @MessageBody() data: { status: 'idle' | 'busy' | 'sleep'; mcpConnected?: boolean; availableFunctions?: string[]; metrics?: Record<string, unknown>; sleep?: { reason: string; since: string; until?: string } },
    @ConnectedSocket() client: Socket,
  ) {
    if (client.data.type !== 'agent') {
      return { success: false, error: 'agent:heartbeat is only for agent clients' };
    }

    try {
      const { agentId, token } = client.data;
      client.data.lastHeartbeatAt = Date.now();

      const presenceSockets = await this.chatService.getAgentSocketIds(agentId);
      this.logger.debug(`[heartbeat] agentId=${agentId} socketId=${client.id} presence=${JSON.stringify(presenceSockets)} mcpConnected=${data.mcpConnected ?? 'n/a'} availableFunctions=${data.availableFunctions?.length ?? 'n/a'}`);

      await this.chatService.setAgentStatus(agentId, {
        status: data.status === 'sleep' ? 'idle' : data.status,
        lastHeartbeat: new Date().toISOString(),
        conversationId: client.data.conversationId || '',
        metrics: data.metrics ? JSON.stringify(data.metrics) : undefined,
      });

      return await this.heartbeatService.heartbeat(agentId, data, token);
    } catch (error) {
      this.logger.error('Error handling agent:heartbeat:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }

  @SubscribeMessage('conversation:history')
  async handleConversationHistory(
    @MessageBody() data: {
      conversationId: string;
      page?: number;
      limit?: number;
      before?: string;
      includeInternal?: boolean;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      if (client.data.type === 'agent') {
        return { success: false, error: 'conversation:history is not available for agent clients' };
      }

      const { conversationId, page, limit, before, includeInternal } = data;

      const isAnonymous = client.data.type === 'anonymous';
      const conversation = isAnonymous
        ? await this.conversationService.findByIdDirect(conversationId)
        : await this.conversationService.findById(
            conversationId as any,
            { userId: client.data.userId || '', roles: client.data.roles || [], orgId: client.data.orgId, groupId: '', agentId: '', appId: '' },
          );

      if (!conversation) {
        return { success: false, error: `Conversation ${conversationId} not found` };
      }

      if (isAnonymous) {
        const ownerId = (conversation as any).userId;
        if (!ownerId || ownerId !== client.data.userId) {
          return { success: false, error: 'Access denied' };
        }
      }

      const result = await this.actionService.getConversationHistory(conversationId, {
        page,
        limit,
        before,
        includeInternal,
      });

      const messages = result.data.filter((action: any) => action.type === 'message');

      const data_ = messages.map((action: any) => {
        const isAgentActor = action.actor?.role === 'agent';
        return {
          _id: action._id?.toString(),
          conversationId: action.conversationId,
          role: isAgentActor ? 'assistant' : 'user',
          content: action.content,
          type: action.type === 'notice' ? 'system' : 'message',
          userId: action.actor?.userId,
          username: isAgentActor ? undefined : action.actor?.displayName,
          agentId: action.actor?.agentId,
          attachments: action.metadata?.attachments,
          references: action.metadata?.references,
          skipAgent: action.metadata?.skipAgent,
          createdAt: action.createdAt,
        };
      });

      return {
        success: true,
        conversationId,
        data: data_,
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasMore: result.hasMore,
      };
    } catch (error) {
      this.logger.error('Error fetching conversation history:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }

  @SubscribeMessage('channel:send')
  async handleChannelSend(
    @MessageBody() dto: {
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
      return { success: false, error: 'connectionId, channelId and one of content, embed, or file are required' };
    }

    if (file && !file.fileUrl) {
      return { success: false, error: 'file.fileUrl is required' };
    }

    if (!this.redisPub) {
      return { success: false, error: 'Internal error: Redis not available' };
    }

    try {
      await this.redisPub.publish(
        'outbound:direct',
        JSON.stringify({ connectionId, channelId, content, embed, file, conversationId: conversationId || null }),
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

  @SubscribeMessage('message:read')
  async handleMessageRead(
    @MessageBody() data: { conversationId: string; messageId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { conversationId, messageId } = data;
      client.to(`conversation:${conversationId}`).emit('message:read', {
        type: client.data.type,
        userId: client.data.userId,
        agentId: client.data.agentId,
        messageId,
        conversationId,
        timestamp: new Date(),
      });
      return { success: true };
    } catch (error) {
      this.logger.error('Error marking message as read:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers — replaces AgentService methods
  // ---------------------------------------------------------------------------

  private async _verifyExternalSignedToken(agentId: string, token: string): Promise<any> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid token format');
    }

    let header: any;
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid token header');
    }

    if (header.alg !== 'ES256') {
      throw new UnauthorizedException('Token must use ES256 algorithm');
    }

    const kid = header.kid;

    const agentWithKeys = await this.agentModel
      .findOne({ _id: agentId, isDeleted: false })
      .select('+externalSigningKeys')
      .lean();

    if (!agentWithKeys) {
      throw new UnauthorizedException('Agent not found');
    }

    const keys: any[] = (agentWithKeys as any).externalSigningKeys ?? [];
    const now = new Date();

    const candidates = kid ? keys.filter((k) => k.keyId === kid) : keys;
    const activeKey = candidates.find(
      (k) => !k.revokedAt && (!k.expiresAt || new Date(k.expiresAt) > now),
    );

    if (!activeKey) {
      throw new UnauthorizedException(
        kid ? `No active signing key found for kid="${kid}"` : 'No active signing keys configured for this agent',
      );
    }

    let payload: any;
    try {
      const pubKey = crypto.createPublicKey({ key: activeKey.publicKey, format: 'pem' });
      const verify = crypto.createVerify('SHA256');
      verify.update(`${parts[0]}.${parts[1]}`);
      const sig = Buffer.from(parts[2], 'base64url');
      if (!verify.verify({ key: pubKey, dsaEncoding: 'ieee-p1363' }, sig)) {
        throw new Error('Signature mismatch');
      }
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch (err: any) {
      throw new UnauthorizedException(`Token signature verification failed: ${err.message}`);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) {
      throw new UnauthorizedException('Token has expired');
    }

    if (payload.agentId && payload.agentId !== agentId) {
      throw new UnauthorizedException('Token agentId does not match');
    }

    return payload;
  }

  private async _validateAndTouchAnonymousToken(agentId: string, tokenId: string): Promise<boolean> {
    const agentWithToken = await this.agentModel
      .findOne({ _id: agentId, 'anonymousTokens.tokenId': tokenId })
      .select('anonymousTokens.$')
      .lean();

    const tokenEntry = (agentWithToken as any)?.anonymousTokens?.[0];
    if (!tokenEntry || tokenEntry.revokedAt) {
      return false;
    }

    await this.agentModel.updateOne(
      { _id: agentId, 'anonymousTokens.tokenId': tokenId },
      { $set: { 'anonymousTokens.$.lastConnectedAt': new Date() } },
    );

    return true;
  }
}
