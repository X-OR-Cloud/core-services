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
import { ChatService } from './chat.service';
import { ConversationService } from '../conversation/conversation.service';
import { AgentService } from '../agent/agent.service';
import { ActionService } from '../action/action.service';
import { ActionType, ActorRole } from '../action/action.enum';

/**
 * ChatGateway - WebSocket Gateway for real-time chat
 *
 * Client Events (emit to server):
 * - agent:connect     - Authenticated user connects to an agent (creates/resumes conversation)
 * - conversation:join - Join a specific conversation by ID (resume existing)
 * - conversation:leave - Leave a conversation room
 * - message:send      - Send a new message
 * - message:typing    - Typing indicator (both user and agent)
 * - presence:online   - User/agent online status
 *
 * Server Events (emit to client):
 * - message:new       - New message received
 * - message:sent      - Message successfully sent
 * - message:error     - Error sending message
 * - agent:typing      - Agent is typing (received by users)
 * - user:typing       - User is typing (received by agents)
 * - presence:update   - Online status update (includes conversationId for anonymous/agent:connect flow)
 */
@WebSocketGateway({
  namespace: '/ws/chat',
  /* cors: {
    origin: '*', // TODO: Configure CORS properly in production
    credentials: true,
  }, */
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private redisSub: Redis | null = null;
  private redisPub: Redis | null = null;

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly conversationService: ConversationService,
    private readonly agentService: AgentService,
    private readonly actionService: ActionService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Chat WebSocket Gateway initialized');
  }

  async onModuleInit() {
    this.redisSub = new Redis(redisConfig);
    this.redisPub = new Redis(redisConfig);

    await this.redisSub.subscribe('agent:join-room', 'chat:message-new', 'outbound:command');
    await this.redisSub.psubscribe('chat:response:*');

    this.redisSub.on('pmessage', async (_pattern, channel, message) => {
      // channel = chat:response:{conversationId}
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

        // Typing indicator — broadcast only, no DB save (no dedup needed)
        if (payload.type === 'typing') {
          this.server.to(`conversation:${conversationId}`).emit('agent:typing', {
            agentId: payload.agentId,
            conversationId,
            isTyping: payload.isTyping ?? false,
            timestamp: new Date(),
          });
          return;
        }

        // Distributed dedup: only one WS instance processes each response
        if (payload.nonce && this.redisPub) {
          const lockKey = `lock:chat-resp:${payload.nonce}`;
          const acquired = await this.redisPub.set(lockKey, '1', 'EX', 10, 'NX');
          if (!acquired) {
            this.logger.debug(`[Redis] chat:response skipped (lock taken) nonce=${payload.nonce}`);
            return;
          }
        }

        // Save action to DB
        const actionTypeMap: Record<string, ActionType> = {
          message: ActionType.MESSAGE,
          system: ActionType.NOTICE,
          tool_use: ActionType.TOOL_USE,
          tool_result: ActionType.TOOL_RESULT,
          thinking: ActionType.THINKING,
          error: ActionType.ERROR,
        };
        const actionType = actionTypeMap[payload.type] ?? ActionType.MESSAGE;
        const savedAction = await this.actionService.createActionDirect(
          {
            conversationId,
            type: actionType,
            actor: { role: ActorRole.AGENT, agentId: payload.agentId, displayName: payload.agentId },
            content: payload.content,
            ...(payload.sources?.length ? { sources: payload.sources } : {}),
            ...(payload.workId ? { workId: payload.workId } : {}),
          } as any,
          { orgId: payload.orgId || '', agentId: payload.agentId, userId: '' },
        );
        const actionId = (savedAction as any)._id?.toString() || 'unknown';

        // Broadcast to conversation room (users only receive type=message — frontend filters the rest)
        this.server.to(`conversation:${conversationId}`).emit('message:new', {
          _id: actionId,
          conversationId,
          role: 'assistant',
          type: payload.type,
          content: payload.content,
          agentId: payload.agentId,
          platform: 'portal',
          ...(payload.sources?.length ? { sources: payload.sources } : {}),
          ...(payload.workId ? { workId: payload.workId } : {}),
        });

        // Bridge final assistant message to Connection Worker (Discord/Telegram outbound)
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
          const { actionId, conversationId, agentId, orgId, role, content, attachments, userId, username, fullname, externalUsername, externalUserId, channelId, connectionId, platform, msgNonce, skipAgent } = JSON.parse(message);
          // Distributed lock: only one WS instance processes each inbound message
          const lockKey = `lock:chat-msg:${msgNonce}`;
          const acquired = await this.redisPub!.set(lockKey, '1', 'EX', 10, 'NX');
          if (!acquired) {
            this.logger.debug(`[Redis] chat:message-new skipped (lock taken) nonce=${msgNonce}`);
            return;
          }
          const broadcastPayload = { _id: actionId, conversationId, orgId, role, content, attachments, userId, username, fullname, externalUsername, externalUserId, channelId, connectionId, platform, ...(skipAgent ? { skipAgent: true } : {}) };
          // Broadcast to user sockets in room regardless of agent type
          this.server.to(`conversation:${conversationId}`).emit('message:new', broadcastPayload);

          // Route to agent:
          // - assistant agent → Redis task queue (worker:agt consumes via BLPOP)
          // - engineer agent → already in room via WS, receives message:new above
          if (!skipAgent && agentId) {
            const agentDoc = await this.agentService.findByIdInternal(agentId);
            if ((agentDoc as any)?.type === 'assistant') {
              const task = {
                taskId: actionId,
                agentId,
                conversationId,
                actionId,
                content,
                role,
                orgId: orgId || '',
                userId,
                username,
                fullname,
                externalUsername,
                externalUserId,
                channelId,
                connectionId,
                attachments,
                platform,
                timestamp: new Date().toISOString(),
              };
              this.redisPub!.lpush(`chat:task:${agentId}`, JSON.stringify(task)).catch((err: Error) =>
                this.logger.error(`Failed to push task from con worker: ${err.message}`),
              );
              this.logger.debug(`[Redis] chat:task:${agentId} pushed from con-worker taskId=${actionId}`);
            } else {
              // Engineer agent: ensure agent is in the conversation room
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

      if (channel === 'outbound:command') {
        try {
          if (!this.server) return;
          const { agentId, conversationId, command, reason } = JSON.parse(message);
          const agentSocketIds = await this.chatService.getAgentSocketIds(agentId);
          if (agentSocketIds.length > 0) {
            this.server.in(agentSocketIds).emit('agent:command', { type: command, conversationId, reason });
            this.logger.debug(`[Redis] outbound:command /${command} → agentId=${agentId} sockets=${agentSocketIds.length}`);
          } else {
            this.logger.warn(`[Redis] outbound:command /${command} — agent ${agentId} not connected`);
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

      // Try server-issued JWT first
      let payload: any;
      let isExternalSigned = false;
      try {
        payload = this.jwtService.verify(token);
      } catch {
        // Fallback: try external-signed ES256 token
        // Decode without verify to get agentId for key lookup
        const decoded = this.jwtService.decode(token) as Record<string, any> | null;
        if (decoded?.type === 'anonymous' && decoded?.agentId) {
          payload = await this.agentService.verifyExternalSignedToken(decoded.agentId, token);
          isExternalSigned = true;
        } else {
          throw new Error('Token verification failed and not a valid external-signed anonymous token');
        }
      }

      // Check anonymous first — anonymous token contains agentId which would
      // otherwise be misidentified as an agent token
      const isAnonymous = payload.type === 'anonymous';
      const isAgent = !isAnonymous && (payload.type === 'agent' || !!payload.agentId);

      if (isAnonymous) {
        // External-signed tokens have no tokenId — skip DB revocation check
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
          // ignore decode errors
        }
      }
      this.logger.error(
        `Authentication failed for client ${client.id}${agentInfo}: ${(error as Error).message}`,
      );
      client.disconnect();
    }
  }

  // ---------------------------------------------------------------------------
  // Internal connection handlers
  // ---------------------------------------------------------------------------

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

    // Auto-rejoin active conversation rooms so agent can receive messages
    // without waiting for a new inbound message to trigger agent:join-room
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
      this.logger.warn(`[WS-CONNECT] Failed to rejoin rooms for agent ${agentId}: ${(err as Error).message}`);
    }

    this.logger.log(
      `[WS-CONNECT] Agent connected | socketId=${client.id} | agentId=${agentId}`,
    );

    this.server.emit('presence:update', {
      type: 'agent',
      agentId,
      status: 'online',
      timestamp: new Date(),
    });
  }

  private async _handleAnonymousConnect(client: Socket, payload: any, isExternalSigned = false) {
    const { anonymousId, agentId, orgId, tokenId } = payload;

    // External-signed tokens have no tokenId — skip DB revocation check (signature + exp already verified)
    if (!isExternalSigned && tokenId) {
      const isValid = await this.agentService.validateAndTouchAnonymousToken(agentId, tokenId);
      if (!isValid) {
        this.logger.warn(`Anonymous token ${tokenId} is revoked or not found, rejecting client ${client.id}`);
        client.disconnect();
        return;
      }
    }

    // Anonymous always has agentId in token — auto findOrCreate based on agent's conversationMode
    const agent = await this.agentService.findByIdInternal(agentId);

    // Derive orgId from agent when not present in token (external-signed tokens omit orgId)
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

    this.server.emit('presence:update', {
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

    this.logger.log(
      `[WS-CONNECT] User connected | socketId=${client.id} | userId=${userId}`,
    );

    // No room join yet — user must emit agent:connect or conversation:join
    this.server.emit('presence:update', {
      type: 'user',
      userId,
      status: 'online',
      timestamp: new Date(),
    });
  }

  // ---------------------------------------------------------------------------
  // Helper: join room + agent socketsJoin
  // ---------------------------------------------------------------------------

  private async _joinConversationRoom(
    client: Socket,
    conversationId: string,
    agentId: string,
  ) {
    await client.join(`conversation:${conversationId}`);
    client.data.conversationId = conversationId;
    client.data.agentId = agentId;

    // Cache agent type so handleSendMessage can route assistant → Redis queue, engineer → WS broadcast
    if (!client.data.agentType && agentId) {
      try {
        const agent = await this.agentService.findByIdInternal(agentId);
        client.data.agentType = (agent as any)?.type ?? 'engineer';
      } catch {
        client.data.agentType = 'engineer';
      }
    }

    const participantId = client.data.userId || client.data.agentId;
    await this.chatService.joinConversation(conversationId, participantId);
    await this.chatService.updateSocketConversation(client.id, conversationId);
    await this.chatService.addSocketToConversation(conversationId, client.id);

    // Cross-instance: force agent socket(s) to join this room via Redis Adapter
    const agentSocketIds = await this.chatService.getAgentSocketIds(agentId);
    if (agentSocketIds.length > 0) {
      this.server.in(agentSocketIds).socketsJoin(`conversation:${conversationId}`);
      this.logger.debug(
        `[WS-JOIN] Agent socketsJoin | agentId=${agentId} | conversationId=${conversationId} | sockets=${agentSocketIds.length}`,
      );
      // Notify this client that the agent is already online (agent connected before user)
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

  // ---------------------------------------------------------------------------
  // Disconnect
  // ---------------------------------------------------------------------------

  async handleDisconnect(client: Socket) {
    const conversationId = client.data.conversationId;

    if (client.data.type === 'agent' && client.data.agentId) {
      await this.chatService.setAgentOffline(client.data.agentId, client.id);
      await this.chatService.clearAgentStatus(client.data.agentId);
      await this.chatService.removeSocketSession(client.id, conversationId);
      this.logger.debug(
        `[WS-DISCONNECT] Agent disconnected | socketId=${client.id} | agentId=${client.data.agentId}`,
      );
      this.server.emit('presence:update', {
        type: 'agent',
        agentId: client.data.agentId,
        status: 'offline',
        timestamp: new Date(),
      });
    } else if (client.data.userId) {
      await this.chatService.setUserOffline(client.data.userId, client.id);
      await this.chatService.removeSocketSession(client.id, conversationId);
      this.logger.debug(
        `[WS-DISCONNECT] ${client.data.type} disconnected | socketId=${client.id} | userId=${client.data.userId}`,
      );
      this.server.emit('presence:update', {
        type: client.data.type,
        userId: client.data.userId,
        status: 'offline',
        timestamp: new Date(),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Event: agent:connect — authenticated user picks an agent
  // ---------------------------------------------------------------------------

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

      // Notify others in room
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

  // ---------------------------------------------------------------------------
  // Event: conversation:join — resume an existing conversation by ID
  // ---------------------------------------------------------------------------

  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { conversationId } = data;

      // Load conversation to get agentId
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

  // ---------------------------------------------------------------------------
  // Event: conversation:leave
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Event: message:send
  // ---------------------------------------------------------------------------

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
      const conversationId = dto.conversationId || client.data.conversationId;

      if (!conversationId) {
        throw new Error('No conversation found. Please emit agent:connect or conversation:join first.');
      }

      // --- /ignore <text> intercept ---
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

      // Save Action record
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

      const contentPreview = dto.content.length > 20
        ? dto.content.substring(0, 20) + '...'
        : dto.content;

      const senderId = client.data.userId || agentId;
      this.logger.log(
        `[WS-MSG-SEND] actionId=${actionId} | ${client.data.type}Id=${senderId} | role=${dto.role} | conversationId=${conversationId} | content="${contentPreview}"`,
      );
      this.logger.debug(
        `[WS-BROADCAST] room=conversation:${conversationId} | roomSize=${roomSize} | actionId=${actionId}`,
      );

      const broadcastPayload = {
        ...messageDto,
        _id: actionId,
        platform: 'portal',
        ...(skipAgent ? { skipAgent: true } : {}),
        ...(!isAgent && client.data.userId ? { userId: client.data.userId, username: client.data.username, fullname: client.data.fullname } : {}),
      };

      // Route message to agent:
      // - assistant agents (worker:agt) → Redis task queue (no WS round-trip)
      // - engineer agents (self-deployed) → broadcast room via WS (existing behavior)
      const isAssistantAgent = client.data.agentType === 'assistant';
      if (!isAgent && isAssistantAgent && agentId && !skipAgent && this.redisPub) {
        // User → assistant agent: push task to Redis queue
        const task = {
          taskId: actionId,
          agentId,
          conversationId,
          actionId,
          content: dto.content,
          role: dto.role,
          orgId: client.data.orgId || '',
          userId: client.data.userId || undefined,
          username: client.data.username || undefined,
          fullname: client.data.fullname || undefined,
          attachments: dto.attachments,
          references: dto.references,
          sources: dto.sources,
          workId: dto.workId,
          platform: 'portal',
          timestamp: new Date().toISOString(),
        };
        this.redisPub.lpush(`chat:task:${agentId}`, JSON.stringify(task)).catch((err: Error) =>
          this.logger.error(`Failed to push task to chat:task:${agentId}: ${err.message}`),
        );
        this.logger.debug(`[Redis] chat:task:${agentId} pushed taskId=${actionId}`);
        // Broadcast message to user sockets only (sender sees their own message)
        this.server.to(`conversation:${conversationId}`).emit('message:new', broadcastPayload);
      } else {
        // Engineer agent or agent-sent message → broadcast room via WS (existing behavior)
        this.server.to(`conversation:${conversationId}`).emit('message:new', broadcastPayload);

        // Bridge agent response back to con worker (Discord/Telegram outbound)
        // Lock on actionId to prevent duplicate outbound from multiple WS instances
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

      client.emit('message:sent', {
        success: true,
        messageId: actionId,
        timestamp: new Date(),
      });

      return { success: true, message: broadcastPayload };
    } catch (error) {
      this.logger.error('Error sending message:', (error as Error).message);
      client.emit('message:error', {
        success: false,
        error: (error as Error).message,
        timestamp: new Date(),
      });
      return { success: false, error: (error as Error).message };
    }
  }

  // ---------------------------------------------------------------------------
  // Event: message:typing
  // ---------------------------------------------------------------------------

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

    // Bridge agent typing indicator to Discord/Telegram via Connection Worker
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

  // ---------------------------------------------------------------------------
  // Event: conversation:online
  // ---------------------------------------------------------------------------

  @SubscribeMessage('conversation:online')
  async handleGetOnlineUsers(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const onlineUsers = await this.chatService.getOnlineUsersInConversation(data.conversationId);
      return { success: true, onlineUsers };
    } catch (error) {
      this.logger.error('Error getting online users:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }

  // ---------------------------------------------------------------------------
  // Event: agent:heartbeat — agent-only, mirrors POST /agents/heartbeat
  // ---------------------------------------------------------------------------

  @SubscribeMessage('agent:heartbeat')
  async handleHeartbeat(
    @MessageBody() data: { status: 'idle' | 'busy'; metrics?: Record<string, unknown> },
    @ConnectedSocket() client: Socket,
  ) {
    if (client.data.type !== 'agent') {
      return { success: false, error: 'agent:heartbeat is only for agent clients' };
    }

    try {
      const { agentId, token } = client.data;
      client.data.lastHeartbeatAt = Date.now();

      await this.chatService.setAgentStatus(agentId, {
        status: data.status,
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
  // Event: command:send — authorized users only
  // Dispatches stop/reload/inspect as agent:command directly to agent socket(s)
  // ---------------------------------------------------------------------------

  @SubscribeMessage('command:send')
  async handleCommandSend(
    @MessageBody() data: { command: 'stop' | 'reload' | 'inspect'; conversationId?: string; reason?: string },
    @ConnectedSocket() client: Socket,
  ) {
    // Anonymous clients cannot issue commands
    if (client.data.type === 'anonymous') {
      return { success: false, error: 'Unauthorized: anonymous clients cannot issue commands' };
    }

    const { command, conversationId, reason } = data;
    const agentId: string = client.data.agentId || '';
    const orgId: string = client.data.orgId || '';
    const userId: string = client.data.userId || '';

    if (!agentId) {
      return { success: false, error: 'No agent associated with this connection' };
    }

    // Save DB Action for commands with side effects
    if (command === 'stop' || command === 'reload') {
      await this.actionService.createActionDirect(
        {
          conversationId: conversationId || '',
          type: ActionType.COMMAND,
          actor: { role: ActorRole.USER, userId, displayName: client.data.username || userId },
          content: `/${command}`,
          metadata: { commandName: command, ...(reason ? { reason } : {}), ...(conversationId ? { targetConversationId: conversationId } : {}) },
        },
        { orgId, userId },
      );
    }

    // Route command:
    // - assistant agents (worker:agt) → Redis pub/sub chat:cmd:{agentId}
    // - engineer agents (self-deployed) → WS agent:command direct emit
    const isAssistantAgent = client.data.agentType === 'assistant';
    if (isAssistantAgent && this.redisPub) {
      this.redisPub.publish(`chat:cmd:${agentId}`, JSON.stringify({ type: command, conversationId, reason })).catch((err: Error) =>
        this.logger.error(`Failed to publish chat:cmd: ${err.message}`),
      );
      this.logger.log(`[Redis] chat:cmd:${agentId} command=${command} conversationId=${conversationId || 'n/a'}`);
    } else {
      const agentSocketIds = await this.chatService.getAgentSocketIds(agentId);
      if (agentSocketIds.length === 0) {
        return { success: false, error: 'Agent is not connected' };
      }
      this.server.in(agentSocketIds).emit('agent:command', { type: command, conversationId, reason });
      this.logger.log(`[WS-CMD] command=${command} agentId=${agentId} sockets=${agentSocketIds.length} conversationId=${conversationId || 'n/a'}`);
    }

    return { success: true, command };
  }

  // ---------------------------------------------------------------------------
  // Event: conversation:history — fetch paginated message history for Chat UI
  // ---------------------------------------------------------------------------

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

      // Verify client has access to this conversation
      const conversation = await this.conversationService.findById(
        conversationId as any,
        { userId: client.data.userId || '', roles: client.data.roles || [], orgId: client.data.orgId, groupId: '', agentId: '', appId: '' },
      );

      if (!conversation) {
        return { success: false, error: `Conversation ${conversationId} not found` };
      }

      const result = await this.actionService.getConversationHistory(conversationId, {
        page,
        limit,
        before,
        includeInternal,
      });

      // Map Action documents to message:new-shaped objects for uniform rendering
      const data_ = result.data.map((action: any) => {
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

  // ---------------------------------------------------------------------------
  // Event: channel:send — agent-only, proactive message to a platform channel
  // ---------------------------------------------------------------------------

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
      return { success: false, error: 'file.fileUrl is required — upload the file to S3 first via POST /files/upload, then pass the returned fileUrl' };
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

  // ---------------------------------------------------------------------------
  // Event: message:read
  // ---------------------------------------------------------------------------

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
}
