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
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { CreateMessageDto } from '../message/dto/create-message.dto';
import { ConversationService } from '../conversation/conversation.service';
import { MessageDocument } from '../message/message.schema';

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
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly conversationService: ConversationService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Chat WebSocket Gateway initialized');
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
      // Check anonymous first — anonymous token contains agentId which would
      // otherwise be misidentified as an agent token
      const isAnonymous = payload.type === 'anonymous';
      const isAgent = !isAnonymous && (payload.type === 'agent' || !!payload.agentId);

      if (isAnonymous) {
        await this._handleAnonymousConnect(client, payload);
      } else if (isAgent) {
        await this._handleAgentConnect(client, payload);
      } else {
        await this._handleUserConnect(client, payload);
      }
    } catch (error) {
      this.logger.error(
        `Authentication failed for client ${client.id}:`,
        (error as Error).message,
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

    await this.chatService.setAgentOnline(agentId, client.id);

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

  private async _handleAnonymousConnect(client: Socket, payload: any) {
    const { anonymousId, agentId, orgId } = payload;

    client.data.type = 'anonymous';
    client.data.userId = anonymousId;
    client.data.agentId = agentId;
    client.data.orgId = orgId;
    client.data.roles = [];

    await this.chatService.setUserOnline(anonymousId, client.id);

    // Anonymous always has agentId in token — auto findOrCreate
    const conversation = await this.conversationService.findOrCreateForUser(
      anonymousId,
      agentId,
      orgId,
      'anonymous',
    );
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
    client.data.agentId = null;
    client.data.orgId = payload.orgId;
    client.data.roles = payload.roles || [];

    await this.chatService.setUserOnline(userId, client.id);

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

    const participantId = client.data.userId || client.data.agentId;
    await this.chatService.joinConversation(conversationId, participantId);

    // Cross-instance: force agent socket(s) to join this room via Redis Adapter
    const agentSocketIds = await this.chatService.getAgentSocketIds(agentId);
    if (agentSocketIds.length > 0) {
      this.server.in(agentSocketIds).socketsJoin(`conversation:${conversationId}`);
      this.logger.debug(
        `[WS-JOIN] Agent socketsJoin | agentId=${agentId} | conversationId=${conversationId} | sockets=${agentSocketIds.length}`,
      );
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
    if (client.data.type === 'agent' && client.data.agentId) {
      await this.chatService.setAgentOffline(client.data.agentId, client.id);
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
    @MessageBody() dto: CreateMessageDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const conversationId = dto.conversationId || client.data.conversationId;

      if (!conversationId) {
        throw new Error('No conversation found. Please emit agent:connect or conversation:join first.');
      }

      const messageDto = { ...dto, conversationId };

      const isAgent = client.data.type === 'agent';
      const isAnonymous = client.data.type === 'anonymous';
      // Agent and anonymous users bypass RBAC with a minimum role
      const roles = isAgent
        ? ['organization.editor']
        : isAnonymous
          ? ['organization.viewer']
          : client.data.roles;
      const context = {
        userId: client.data.userId || '',
        roles,
        orgId: client.data.orgId,
        groupId: '',
        agentId: client.data.agentId || '',
        appId: '',
      };

      const message = await this.chatService.sendMessage(messageDto, context);
      const messageDoc = message as MessageDocument;
      const messageId = messageDoc._id?.toString() || 'unknown';

      let roomSize = 0;
      try {
        roomSize = this.server?.sockets?.adapter?.rooms?.get(`conversation:${conversationId}`)?.size || 0;
      } catch { /* adapter not ready */ }

      const contentPreview = dto.content.length > 20
        ? dto.content.substring(0, 20) + '...'
        : dto.content;

      const senderId = client.data.userId || client.data.agentId;
      this.logger.log(
        `[WS-MSG-SEND] msgId=${messageId} | ${client.data.type}Id=${senderId} | role=${dto.role} | conversationId=${conversationId} | content="${contentPreview}"`,
      );
      this.logger.debug(
        `[WS-BROADCAST] room=conversation:${conversationId} | roomSize=${roomSize} | msgId=${messageId}`,
      );

      this.server.to(`conversation:${conversationId}`).emit('message:new', message);

      client.emit('message:sent', {
        success: true,
        messageId: messageDoc._id?.toString() || '',
        timestamp: new Date(),
      });

      return { success: true, message };
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
