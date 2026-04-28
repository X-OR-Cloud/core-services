import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Conversation, ConversationDocument } from '../conversation/conversation.schema';
import { Action, ActionDocument } from '../action/action.schema';
import { Connection, ConnectionDocument } from '../connection/connection.schema';
import { PresenceService } from '../presence/presence.service';

export interface ParticipantMonitorItem {
  type: 'user' | 'agent';
  id: string;
  joinedConversation: string;
  isOnline: boolean;
  sockets: { socketId: string; connectedAt: string; status: 'connected' }[];
  agentStatus?: 'idle' | 'busy' | 'unknown';
  lastHeartbeat?: string;
  lastSent?: { content: string; createdAt: string };
  lastReceived?: { content: string; createdAt: string };
}

export interface ConversationMonitorItem {
  conversationId: string;
  title: string;
  mode: 'user' | 'connection' | 'shared';
  conversationType: string;
  status: string;
  agentId: string;
  connectionId?: string;
  connectionName?: string;
  platform?: string;
  createdAt: string;
  lastMessage?: { content: string; role: string; createdAt: Date };
  participants: ParticipantMonitorItem[];
}

export interface MonitorResponse {
  generatedAt: string;
  summary: {
    totalActiveConversations: number;
    totalOnlineUsers: number;
    totalOnlineAgents: number;
  };
  conversations: ConversationMonitorItem[];
}

/**
 * ChatService — Monitor API only (Redis presence delegated to PresenceService).
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly presenceService: PresenceService,
    @InjectModel(Conversation.name) private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Action.name) private readonly actionModel: Model<ActionDocument>,
    @InjectModel(Connection.name) private readonly connectionModel: Model<ConnectionDocument>,
  ) {}

  // ---------------------------------------------------------------------------
  // Presence delegation — kept for backward compatibility with ChatGateway
  // ---------------------------------------------------------------------------

  setUserOnline(userId: string, socketId: string) { return this.presenceService.setUserOnline(userId, socketId); }
  setUserOffline(userId: string, socketId: string) { return this.presenceService.setUserOffline(userId, socketId); }
  isUserOnline(userId: string) { return this.presenceService.isUserOnline(userId); }
  getAllOnlineUsers() { return this.presenceService.getAllOnlineUsers(); }

  setAgentOnline(agentId: string, socketId: string) { return this.presenceService.setAgentOnline(agentId, socketId); }
  setAgentOffline(agentId: string, socketId: string) { return this.presenceService.setAgentOffline(agentId, socketId); }
  isAgentOnline(agentId: string) { return this.presenceService.isAgentOnline(agentId); }
  getAgentSocketIds(agentId: string) { return this.presenceService.getAgentSocketIds(agentId); }
  getAllOnlineAgents() { return this.presenceService.getAllOnlineAgents(); }

  joinConversation(conversationId: string, participantId: string) { return this.presenceService.joinConversation(conversationId, participantId); }
  leaveConversation(conversationId: string, participantId: string) { return this.presenceService.leaveConversation(conversationId, participantId); }
  getOnlineUsersInConversation(conversationId: string) { return this.presenceService.getOnlineUsersInConversation(conversationId); }

  setSocketSession(socketId: string, data: Parameters<PresenceService['setSocketSession']>[1]) { return this.presenceService.setSocketSession(socketId, data); }
  updateSocketConversation(socketId: string, conversationId: string) { return this.presenceService.updateSocketConversation(socketId, conversationId); }
  removeSocketSession(socketId: string, conversationId?: string) { return this.presenceService.removeSocketSession(socketId, conversationId); }
  getSocketSession(socketId: string) { return this.presenceService.getSocketSession(socketId); }

  addSocketToConversation(conversationId: string, socketId: string) { return this.presenceService.addSocketToConversation(conversationId, socketId); }
  removeSocketFromConversation(conversationId: string, socketId: string) { return this.presenceService.removeSocketFromConversation(conversationId, socketId); }
  getConversationSockets(conversationId: string) { return this.presenceService.getConversationSockets(conversationId); }
  getAllActiveConversationIds() { return this.presenceService.getAllActiveConversationIds(); }

  setAgentStatus(agentId: string, data: Parameters<PresenceService['setAgentStatus']>[1]) { return this.presenceService.setAgentStatus(agentId, data); }
  getAgentStatus(agentId: string) { return this.presenceService.getAgentStatus(agentId); }
  clearAgentStatus(agentId: string) { return this.presenceService.clearAgentStatus(agentId); }

  cleanupStalePresence() { return this.presenceService.cleanupStalePresence(); }

  // ---------------------------------------------------------------------------
  // Monitor API
  // ---------------------------------------------------------------------------

  async getMonitorData(filter?: { agentId?: string; connectionId?: string }): Promise<MonitorResponse> {
    const redisConvIds = await this.presenceService.getAllActiveConversationIds();

    const dbQuery: any = { status: 'active', isDeleted: false };
    if (filter?.agentId) dbQuery.agentId = filter.agentId;
    if (filter?.connectionId) dbQuery.connectionId = filter.connectionId;

    const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dbConvs = await this.conversationModel
      .find({ ...dbQuery, updatedAt: { $gte: recentCutoff } })
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean()
      .exec();

    const dbConvIds = dbConvs.map((c: any) => c._id.toString());

    const missingIds = redisConvIds.filter((id) => !dbConvIds.includes(id));
    let allConvDocs: any[] = [...dbConvs];
    if (missingIds.length > 0) {
      const extra = await this.conversationModel
        .find({ _id: { $in: missingIds }, isDeleted: false })
        .lean()
        .exec();
      allConvDocs = [...allConvDocs, ...extra];
    }

    if (filter?.agentId) {
      allConvDocs = allConvDocs.filter((c: any) => c.agentId === filter.agentId);
    }
    if (filter?.connectionId) {
      allConvDocs = allConvDocs.filter((c: any) => c.connectionId === filter.connectionId);
    }

    const finalConvIds = allConvDocs.map((c: any) => c._id.toString());

    const connectionIds = [...new Set(allConvDocs.map((c: any) => c.connectionId).filter(Boolean))];
    const connectionMap = new Map<string, { name: string; provider: string }>();
    if (connectionIds.length > 0) {
      const connections = await this.connectionModel
        .find({ _id: { $in: connectionIds } })
        .select('name provider')
        .lean()
        .exec();
      for (const conn of connections) {
        connectionMap.set((conn as any)._id.toString(), { name: (conn as any).name, provider: (conn as any).provider });
      }
    }

    const lastActionsRaw = await this.actionModel.aggregate([
      { $match: { conversationId: { $in: finalConvIds }, type: 'message' } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            conversationId: '$conversationId',
            actorId: { $ifNull: ['$actor.userId', '$actor.agentId'] },
          },
          content: { $first: '$content' },
          createdAt: { $first: '$createdAt' },
          role: { $first: '$actor.role' },
        },
      },
    ]);

    type LastMsg = { content: string; createdAt: Date };
    const lastSentMap = new Map<string, Map<string, LastMsg>>();
    for (const row of lastActionsRaw) {
      const convId = row._id.conversationId;
      const actorId = row._id.actorId;
      if (!lastSentMap.has(convId)) lastSentMap.set(convId, new Map());
      lastSentMap.get(convId)!.set(actorId, { content: row.content, createdAt: row.createdAt });
    }

    const allConvSocketIds = new Map<string, string[]>();
    for (const convId of finalConvIds) {
      allConvSocketIds.set(convId, await this.presenceService.getConversationSockets(convId));
    }

    const allSocketIds = Array.from(new Set(Array.from(allConvSocketIds.values()).flat()));
    const socketSessionMap = new Map<string, Awaited<ReturnType<PresenceService['getSocketSession']>>>();
    for (const sid of allSocketIds) {
      const session = await this.presenceService.getSocketSession(sid);
      if (session) socketSessionMap.set(sid, session);
    }

    const conversations: ConversationMonitorItem[] = [];

    for (const conv of allConvDocs) {
      const convId = conv._id.toString();
      const mode = !conv.connectionId ? 'user' : !conv.userId ? 'shared' : 'connection';
      const connInfo = conv.connectionId ? connectionMap.get(conv.connectionId) : undefined;
      const convSockets = allConvSocketIds.get(convId) || [];
      const lastActorMap = lastSentMap.get(convId) || new Map();

      const participantMap = new Map<string, { type: 'user' | 'agent'; joinedConversation: string }>();

      for (const p of (conv.participants || [])) {
        participantMap.set(p.id, { type: p.type, joinedConversation: p.joined?.toISOString?.() ?? '' });
      }
      for (const sid of convSockets) {
        const s = socketSessionMap.get(sid);
        if (!s) continue;
        if (!participantMap.has(s.actorId)) {
          participantMap.set(s.actorId, { type: s.type === 'agent' ? 'agent' : 'user', joinedConversation: s.connectedAt });
        }
      }
      for (const actorId of lastActorMap.keys()) {
        if (!participantMap.has(actorId)) {
          participantMap.set(actorId, { type: actorId === conv.agentId ? 'agent' : 'user', joinedConversation: '' });
        }
      }

      const participants: ParticipantMonitorItem[] = [];

      for (const [actorId, meta] of participantMap.entries()) {
        const isAgent = meta.type === 'agent';

        const participantSockets = convSockets
          .filter((sid) => socketSessionMap.get(sid)?.actorId === actorId)
          .map((sid) => ({
            socketId: sid,
            connectedAt: socketSessionMap.get(sid)!.connectedAt,
            status: 'connected' as const,
          }));

        const isOnline = isAgent
          ? await this.presenceService.isAgentOnline(actorId)
          : await this.presenceService.isUserOnline(actorId);

        let agentStatus: ParticipantMonitorItem['agentStatus'];
        let lastHeartbeat: string | undefined;
        if (isAgent) {
          const status = await this.presenceService.getAgentStatus(actorId);
          agentStatus = status ? status.status : 'unknown';
          lastHeartbeat = status?.lastHeartbeat;
        }

        const lastSent = lastActorMap.get(actorId);
        let lastReceived: { content: string; createdAt: string } | undefined;
        for (const [otherId, msg] of lastActorMap.entries()) {
          if (otherId !== actorId) {
            if (!lastReceived || msg.createdAt > new Date(lastReceived.createdAt)) {
              lastReceived = { content: msg.content, createdAt: msg.createdAt.toISOString() };
            }
          }
        }

        participants.push({
          type: meta.type,
          id: actorId,
          joinedConversation: meta.joinedConversation,
          isOnline,
          sockets: participantSockets,
          ...(isAgent && { agentStatus, lastHeartbeat }),
          ...(lastSent && { lastSent: { content: lastSent.content, createdAt: lastSent.createdAt.toISOString() } }),
          ...(lastReceived && { lastReceived }),
        });
      }

      conversations.push({
        conversationId: convId,
        title: conv.title,
        mode,
        conversationType: conv.conversationType,
        status: conv.status,
        agentId: conv.agentId,
        ...(conv.connectionId && { connectionId: conv.connectionId }),
        ...(connInfo && { connectionName: connInfo.name, platform: connInfo.provider }),
        createdAt: conv.createdAt?.toISOString?.() ?? '',
        ...(conv.lastMessage && { lastMessage: conv.lastMessage }),
        participants,
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalActiveConversations: conversations.length,
        totalOnlineUsers: (await this.presenceService.getAllOnlineUsers()).length,
        totalOnlineAgents: (await this.presenceService.getAllOnlineAgents()).length,
      },
      conversations,
    };
  }
}
