import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Redis from 'ioredis';
import { Conversation, ConversationDocument } from '../conversation/conversation.schema';
import { Action, ActionDocument } from '../action/action.schema';
import { Connection, ConnectionDocument } from '../connection/connection.schema';

export interface SocketSessionData {
  type: 'user' | 'agent' | 'anonymous';
  actorId: string;
  conversationId: string;
  connectedAt: string;
}

export interface AgentStatusData {
  status: 'idle' | 'busy';
  lastHeartbeat: string;
  conversationId: string;
  metrics?: string;
}

export interface SocketInfo {
  socketId: string;
  connectedAt: string;
  status: 'connected';
}

export interface ParticipantMonitorItem {
  type: 'user' | 'agent';
  id: string;
  joinedConversation: string;
  isOnline: boolean;
  sockets: SocketInfo[];
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
 * ChatService - Business logic for chat functionality
 *
 * Redis keys:
 * - presence:user:{userId}              - Set of socket IDs for online user
 * - presence:agent:{agentId}            - Set of socket IDs for online agent
 * - conversation:{conversationId}:users - Set of online participant IDs in conversation
 * - socket:session:{socketId}           - Hash: type, actorId, conversationId, connectedAt
 * - conversation:sockets:{convId}       - Set of socket IDs currently in this room
 * - agent:status:{agentId}              - Hash: status, lastHeartbeat, conversationId, metrics
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRedis() private readonly redis: Redis,
    @InjectModel(Conversation.name) private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Action.name) private readonly actionModel: Model<ActionDocument>,
    @InjectModel(Connection.name) private readonly connectionModel: Model<ConnectionDocument>,
  ) {}

  /**
   * Set user as online
   */
  async setUserOnline(userId: string, socketId: string): Promise<void> {
    try {
      // Add socket ID to user's presence set
      await this.redis.sadd(`presence:user:${userId}`, socketId);

      // Set expiry for 1 hour (in case disconnect event is missed)
      await this.redis.expire(`presence:user:${userId}`, 3600);

      this.logger.debug(`User ${userId} is now online (socket: ${socketId})`);
    } catch (error) {
      this.logger.error(`Error setting user online:`, error.message);
    }
  }

  /**
   * Set user as offline
   */
  async setUserOffline(userId: string, socketId: string): Promise<void> {
    try {
      // Remove socket ID from user's presence set
      await this.redis.srem(`presence:user:${userId}`, socketId);

      // Check if user has any other active connections
      const remaining = await this.redis.scard(`presence:user:${userId}`);

      if (remaining === 0) {
        // No more connections, delete the key
        await this.redis.del(`presence:user:${userId}`);
        this.logger.debug(`User ${userId} is now offline`);
      } else {
        this.logger.debug(
          `User ${userId} still has ${remaining} active connection(s)`,
        );
      }
    } catch (error) {
      this.logger.error(`Error setting user offline:`, error.message);
    }
  }

  /**
   * Check if user is online
   */
  async isUserOnline(userId: string): Promise<boolean> {
    try {
      const count = await this.redis.scard(`presence:user:${userId}`);
      return count > 0;
    } catch (error) {
      this.logger.error(`Error checking user online status:`, error.message);
      return false;
    }
  }

  /**
   * Join a conversation (track user or agent presence)
   */
  async joinConversation(
    conversationId: string,
    participantId: string,
  ): Promise<void> {
    try {
      // Add participant to conversation's online users set
      await this.redis.sadd(`conversation:${conversationId}:users`, participantId);

      // Set expiry for 24 hours
      await this.redis.expire(`conversation:${conversationId}:users`, 86400);

      this.logger.debug(
        `Participant ${participantId} joined conversation ${conversationId}`,
      );
    } catch (error) {
      this.logger.error(`Error joining conversation:`, error.message);
    }
  }

  /**
   * Leave a conversation (user or agent)
   */
  async leaveConversation(
    conversationId: string,
    participantId: string,
  ): Promise<void> {
    try {
      // Remove participant from conversation's online users set
      await this.redis.srem(`conversation:${conversationId}:users`, participantId);

      this.logger.debug(`Participant ${participantId} left conversation ${conversationId}`);
    } catch (error) {
      this.logger.error(`Error leaving conversation:`, error.message);
    }
  }

  /**
   * Get online users in a conversation
   */
  async getOnlineUsersInConversation(
    conversationId: string,
  ): Promise<string[]> {
    try {
      const userIds = await this.redis.smembers(
        `conversation:${conversationId}:users`,
      );

      // Filter to only include actually online users
      const onlineUsers: string[] = [];
      for (const userId of userIds) {
        const isOnline = await this.isUserOnline(userId);
        if (isOnline) {
          onlineUsers.push(userId);
        }
      }

      return onlineUsers;
    } catch (error) {
      this.logger.error(`Error getting online users:`, error.message);
      return [];
    }
  }

  /**
   * Get all online users
   */
  async getAllOnlineUsers(): Promise<string[]> {
    try {
      const pattern = 'presence:user:*';
      const keys = await this.redis.keys(pattern);

      // Extract user IDs from keys
      const userIds = keys.map((key) => key.replace('presence:user:', ''));

      return userIds;
    } catch (error) {
      this.logger.error(`Error getting all online users:`, error.message);
      return [];
    }
  }

  /**
   * Set agent as online
   */
  async setAgentOnline(agentId: string, socketId: string): Promise<void> {
    try {
      await this.redis.sadd(`presence:agent:${agentId}`, socketId);
      await this.redis.expire(`presence:agent:${agentId}`, 3600);

      this.logger.debug(`Agent ${agentId} is now online (socket: ${socketId})`);
    } catch (error) {
      this.logger.error(`Error setting agent online:`, error.message);
    }
  }

  /**
   * Set agent as offline
   */
  async setAgentOffline(agentId: string, socketId: string): Promise<void> {
    try {
      await this.redis.srem(`presence:agent:${agentId}`, socketId);

      const remaining = await this.redis.scard(`presence:agent:${agentId}`);

      if (remaining === 0) {
        await this.redis.del(`presence:agent:${agentId}`);
        this.logger.debug(`Agent ${agentId} is now offline`);
      }
    } catch (error) {
      this.logger.error(`Error setting agent offline:`, error.message);
    }
  }

  /**
   * Check if agent is online
   */
  async isAgentOnline(agentId: string): Promise<boolean> {
    try {
      const count = await this.redis.scard(`presence:agent:${agentId}`);
      return count > 0;
    } catch (error) {
      this.logger.error(`Error checking agent online status:`, error.message);
      return false;
    }
  }

  /**
   * Get all socket IDs for an agent (used for cross-instance socketsJoin)
   */
  async getAgentSocketIds(agentId: string): Promise<string[]> {
    try {
      return await this.redis.smembers(`presence:agent:${agentId}`);
    } catch (error) {
      this.logger.error(`Error getting agent socket IDs:`, (error as Error).message);
      return [];
    }
  }

  /**
   * Get all online agents
   */
  async getAllOnlineAgents(): Promise<string[]> {
    try {
      const pattern = 'presence:agent:*';
      const keys = await this.redis.keys(pattern);

      const agentIds = keys.map((key) => key.replace('presence:agent:', ''));

      return agentIds;
    } catch (error) {
      this.logger.error(`Error getting all online agents:`, error.message);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Layer 1: Socket Session Registry
  // ---------------------------------------------------------------------------

  /**
   * Register a new socket session when a client connects
   */
  async setSocketSession(socketId: string, data: SocketSessionData): Promise<void> {
    try {
      await this.redis.hset(`socket:session:${socketId}`,
        'type', data.type,
        'actorId', data.actorId,
        'conversationId', data.conversationId,
        'connectedAt', data.connectedAt,
      );
      await this.redis.expire(`socket:session:${socketId}`, 3600);
    } catch (error) {
      this.logger.error(`Error setting socket session:`, error.message);
    }
  }

  /**
   * Update the conversationId for an existing socket session (when joining a room)
   */
  async updateSocketConversation(socketId: string, conversationId: string): Promise<void> {
    try {
      await this.redis.hset(`socket:session:${socketId}`, 'conversationId', conversationId);
      await this.redis.expire(`socket:session:${socketId}`, 3600);
    } catch (error) {
      this.logger.error(`Error updating socket conversation:`, error.message);
    }
  }

  /**
   * Remove socket session and optionally remove from conversation sockets set
   */
  async removeSocketSession(socketId: string, conversationId?: string): Promise<void> {
    try {
      await this.redis.del(`socket:session:${socketId}`);
      if (conversationId) {
        await this.redis.srem(`conversation:sockets:${conversationId}`, socketId);
      }
    } catch (error) {
      this.logger.error(`Error removing socket session:`, error.message);
    }
  }

  /**
   * Get session data for a socket
   */
  async getSocketSession(socketId: string): Promise<SocketSessionData | null> {
    try {
      const data = await this.redis.hgetall(`socket:session:${socketId}`);
      if (!data || !data.type) return null;
      return data as unknown as SocketSessionData;
    } catch (error) {
      this.logger.error(`Error getting socket session:`, error.message);
      return null;
    }
  }

  /**
   * Add a socket to the conversation's socket set
   */
  async addSocketToConversation(conversationId: string, socketId: string): Promise<void> {
    try {
      await this.redis.sadd(`conversation:sockets:${conversationId}`, socketId);
      await this.redis.expire(`conversation:sockets:${conversationId}`, 86400);
    } catch (error) {
      this.logger.error(`Error adding socket to conversation:`, error.message);
    }
  }

  /**
   * Remove a socket from the conversation's socket set
   */
  async removeSocketFromConversation(conversationId: string, socketId: string): Promise<void> {
    try {
      await this.redis.srem(`conversation:sockets:${conversationId}`, socketId);
    } catch (error) {
      this.logger.error(`Error removing socket from conversation:`, error.message);
    }
  }

  /**
   * Get all socket IDs currently in a conversation room
   */
  async getConversationSockets(conversationId: string): Promise<string[]> {
    try {
      return await this.redis.smembers(`conversation:sockets:${conversationId}`);
    } catch (error) {
      this.logger.error(`Error getting conversation sockets:`, error.message);
      return [];
    }
  }

  /**
   * Get all conversation IDs that have at least one socket connected
   */
  async getAllActiveConversationIds(): Promise<string[]> {
    try {
      const keys = await this.redis.keys('conversation:sockets:*');
      return keys.map((key) => key.replace('conversation:sockets:', ''));
    } catch (error) {
      this.logger.error(`Error getting active conversation IDs:`, error.message);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Layer 2: Agent Heartbeat / Status Tracking
  // ---------------------------------------------------------------------------

  /**
   * Store agent status from heartbeat event
   */
  async setAgentStatus(agentId: string, data: AgentStatusData): Promise<void> {
    try {
      await this.redis.hset(`agent:status:${agentId}`,
        'status', data.status,
        'lastHeartbeat', data.lastHeartbeat,
        'conversationId', data.conversationId,
        'metrics', data.metrics ?? '',
      );
      await this.redis.expire(`agent:status:${agentId}`, 300); // 5 min TTL
    } catch (error) {
      this.logger.error(`Error setting agent status:`, error.message);
    }
  }

  /**
   * Get agent status (heartbeat data)
   */
  async getAgentStatus(agentId: string): Promise<AgentStatusData | null> {
    try {
      const data = await this.redis.hgetall(`agent:status:${agentId}`);
      if (!data || !data.status) return null;
      return data as unknown as AgentStatusData;
    } catch (error) {
      this.logger.error(`Error getting agent status:`, error.message);
      return null;
    }
  }

  /**
   * Clear agent status on disconnect
   */
  async clearAgentStatus(agentId: string): Promise<void> {
    try {
      await this.redis.del(`agent:status:${agentId}`);
    } catch (error) {
      this.logger.error(`Error clearing agent status:`, error.message);
    }
  }

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Monitor API
  // ---------------------------------------------------------------------------

  /**
   * Get full monitor snapshot: active conversations + participants + socket/agent status.
   * Combines Redis (socket sessions, presence, agent status) with MongoDB (conversations, actions, connections).
   */
  async getMonitorData(filter?: { orgId?: string; agentId?: string; connectionId?: string }): Promise<MonitorResponse> {
    // 1. Collect active conversationIds from two sources and merge
    const redisConvIds = await this.getAllActiveConversationIds();

    const dbQuery: any = { status: 'active', isDeleted: false };
    if (filter?.orgId) dbQuery['owner.orgId'] = filter.orgId;
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
    const allConvIds = Array.from(new Set([...redisConvIds, ...dbConvIds]));

    // 2. Load any conversations from Redis that weren't in DB query
    const missingIds = redisConvIds.filter((id) => !dbConvIds.includes(id));
    let allConvDocs: any[] = [...dbConvs];
    if (missingIds.length > 0) {
      const missingQuery: any = { _id: { $in: missingIds }, isDeleted: false };
      if (filter?.orgId) missingQuery['owner.orgId'] = filter.orgId;
      const extra = await this.conversationModel
        .find(missingQuery)
        .lean()
        .exec();
      allConvDocs = [...allConvDocs, ...extra];
    }

    // Apply remaining filters
    if (filter?.agentId) {
      allConvDocs = allConvDocs.filter((c: any) => c.agentId === filter.agentId);
    }
    if (filter?.connectionId) {
      allConvDocs = allConvDocs.filter((c: any) => c.connectionId === filter.connectionId);
    }

    const finalConvIds = allConvDocs.map((c: any) => c._id.toString());

    // 3. Batch load connection names
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

    // 4. Batch load last sent/received per participant per conversation from Action collection
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

    // Map: conversationId -> actorId -> { content, createdAt }
    type LastMsg = { content: string; createdAt: Date };
    const lastSentMap = new Map<string, Map<string, LastMsg>>();
    for (const row of lastActionsRaw) {
      const convId = row._id.conversationId;
      const actorId = row._id.actorId;
      if (!lastSentMap.has(convId)) lastSentMap.set(convId, new Map());
      lastSentMap.get(convId)!.set(actorId, { content: row.content, createdAt: row.createdAt });
    }

    // 5. Build per-conversation socket lookup: socketId -> session
    const allConvSocketIds = new Map<string, string[]>(); // conversationId -> socketIds
    for (const convId of finalConvIds) {
      const sockets = await this.getConversationSockets(convId);
      allConvSocketIds.set(convId, sockets);
    }

    // Batch load socket sessions
    const allSocketIds = Array.from(new Set(
      Array.from(allConvSocketIds.values()).flat()
    ));
    const socketSessionMap = new Map<string, SocketSessionData>();
    for (const sid of allSocketIds) {
      const session = await this.getSocketSession(sid);
      if (session) socketSessionMap.set(sid, session);
    }

    // 6. Build response
    const conversations: ConversationMonitorItem[] = [];

    for (const conv of allConvDocs) {
      const convId = conv._id.toString();
      const mode = !conv.connectionId ? 'user' : !conv.userId ? 'shared' : 'connection';
      const connInfo = conv.connectionId ? connectionMap.get(conv.connectionId) : undefined;
      const convSockets = allConvSocketIds.get(convId) || [];
      const lastActorMap = lastSentMap.get(convId) || new Map();

      // Build participant map from DB participants array
      const participantMap = new Map<string, { type: 'user' | 'agent'; joinedConversation: string }>();
      for (const p of (conv.participants || [])) {
        participantMap.set(p.id, {
          type: p.type,
          joinedConversation: p.joined?.toISOString?.() ?? '',
        });
      }

      // Merge in actors found in socket sessions (covers participants not yet in DB array)
      for (const sid of convSockets) {
        const s = socketSessionMap.get(sid);
        if (!s) continue;
        if (!participantMap.has(s.actorId)) {
          participantMap.set(s.actorId, {
            type: s.type === 'agent' ? 'agent' : 'user',
            joinedConversation: s.connectedAt,
          });
        }
      }

      // Merge in actors found in Action history (covers Discord/Telegram users with no socket)
      for (const actorId of lastActorMap.keys()) {
        if (!participantMap.has(actorId)) {
          participantMap.set(actorId, {
            type: actorId === conv.agentId ? 'agent' : 'user',
            joinedConversation: '',
          });
        }
      }

      const participants: ParticipantMonitorItem[] = [];

      for (const [actorId, meta] of participantMap.entries()) {
        const isAgent = meta.type === 'agent';

        // Find sockets belonging to this participant
        const participantSockets: SocketInfo[] = convSockets
          .filter((sid) => {
            const s = socketSessionMap.get(sid);
            return s && s.actorId === actorId;
          })
          .map((sid) => ({
            socketId: sid,
            connectedAt: socketSessionMap.get(sid)!.connectedAt,
            status: 'connected' as const,
          }));

        const isOnline = isAgent
          ? await this.isAgentOnline(actorId)
          : await this.isUserOnline(actorId);

        let agentStatus: ParticipantMonitorItem['agentStatus'];
        let lastHeartbeat: string | undefined;
        if (isAgent) {
          const status = await this.getAgentStatus(actorId);
          agentStatus = status ? status.status : 'unknown';
          lastHeartbeat = status?.lastHeartbeat;
        }

        const lastSent = lastActorMap.get(actorId);

        // lastReceived = most recent message from OTHER participants in this conversation
        let lastReceived: { content: string; createdAt: string } | undefined;
        for (const [otherId, msg] of lastActorMap.entries()) {
          if (otherId !== actorId) {
            if (!lastReceived || msg.createdAt > new Date(lastReceived.createdAt)) {
              lastReceived = { content: msg.content, createdAt: msg.createdAt.toISOString() };
            }
          }
        }

        const item: ParticipantMonitorItem = {
          type: meta.type,
          id: actorId,
          joinedConversation: meta.joinedConversation,
          isOnline,
          sockets: participantSockets,
          ...(isAgent && { agentStatus, lastHeartbeat }),
          ...(lastSent && { lastSent: { content: lastSent.content, createdAt: lastSent.createdAt.toISOString() } }),
          ...(lastReceived && { lastReceived }),
        };

        participants.push(item);
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

    const totalOnlineUsers = (await this.getAllOnlineUsers()).length;
    const totalOnlineAgents = (await this.getAllOnlineAgents()).length;

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalActiveConversations: conversations.length,
        totalOnlineUsers,
        totalOnlineAgents,
      },
      conversations,
    };
  }

  // ---------------------------------------------------------------------------
  // Stale cleanup
  // ---------------------------------------------------------------------------

  /**
   * Clean up stale presence data
   * Should be called periodically by a cron job
   */
  async cleanupStalePresence(): Promise<void> {
    try {
      // Find all presence keys
      const userKeys = await this.redis.keys('presence:user:*');
      const agentKeys = await this.redis.keys('presence:agent:*');

      let cleaned = 0;

      // Clean up user presence
      for (const key of userKeys) {
        const count = await this.redis.scard(key);
        if (count === 0) {
          await this.redis.del(key);
          cleaned++;
        }
      }

      // Clean up agent presence
      for (const key of agentKeys) {
        const count = await this.redis.scard(key);
        if (count === 0) {
          await this.redis.del(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.logger.log(`Cleaned up ${cleaned} stale presence keys`);
      }
    } catch (error) {
      this.logger.error(`Error cleaning up stale presence:`, error.message);
    }
  }
}
