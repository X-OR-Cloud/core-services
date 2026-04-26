import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

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

/**
 * PresenceService — Redis-only presence tracking for WebSocket gateways.
 *
 * Redis keys:
 * - presence:user:{userId}              - Set of socket IDs for online user
 * - presence:agent:{agentId}            - Set of socket IDs for online agent
 * - conversation:{conversationId}:users - Set of online participant IDs
 * - socket:session:{socketId}           - Hash: type, actorId, conversationId, connectedAt
 * - conversation:sockets:{convId}       - Set of socket IDs in this room
 * - agent:status:{agentId}              - Hash: status, lastHeartbeat, conversationId, metrics
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  // ---------------------------------------------------------------------------
  // User presence
  // ---------------------------------------------------------------------------

  async setUserOnline(userId: string, socketId: string): Promise<void> {
    try {
      await this.redis.sadd(`presence:user:${userId}`, socketId);
      await this.redis.expire(`presence:user:${userId}`, 3600);
    } catch (error) {
      this.logger.error(`Error setting user online:`, (error as Error).message);
    }
  }

  async setUserOffline(userId: string, socketId: string): Promise<void> {
    try {
      await this.redis.srem(`presence:user:${userId}`, socketId);
      const remaining = await this.redis.scard(`presence:user:${userId}`);
      if (remaining === 0) {
        await this.redis.del(`presence:user:${userId}`);
      }
    } catch (error) {
      this.logger.error(`Error setting user offline:`, (error as Error).message);
    }
  }

  async isUserOnline(userId: string): Promise<boolean> {
    try {
      return (await this.redis.scard(`presence:user:${userId}`)) > 0;
    } catch (error) {
      this.logger.error(`Error checking user online status:`, (error as Error).message);
      return false;
    }
  }

  async getAllOnlineUsers(): Promise<string[]> {
    try {
      const keys = await this.redis.keys('presence:user:*');
      return keys.map((key) => key.replace('presence:user:', ''));
    } catch (error) {
      this.logger.error(`Error getting all online users:`, (error as Error).message);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Agent presence
  // ---------------------------------------------------------------------------

  async setAgentOnline(agentId: string, socketId: string): Promise<void> {
    try {
      const key = `presence:agent:${agentId}`;
      // Replace entire set — prevents stale socket IDs from accumulating across crashes
      await this.redis.pipeline().del(key).sadd(key, socketId).expire(key, 3600).exec();
    } catch (error) {
      this.logger.error(`Error setting agent online:`, (error as Error).message);
    }
  }

  async setAgentOffline(agentId: string, socketId: string): Promise<void> {
    try {
      await this.redis.srem(`presence:agent:${agentId}`, socketId);
      const remaining = await this.redis.scard(`presence:agent:${agentId}`);
      if (remaining === 0) {
        await this.redis.del(`presence:agent:${agentId}`);
      }
    } catch (error) {
      this.logger.error(`Error setting agent offline:`, (error as Error).message);
    }
  }

  async isAgentOnline(agentId: string): Promise<boolean> {
    try {
      return (await this.redis.scard(`presence:agent:${agentId}`)) > 0;
    } catch (error) {
      this.logger.error(`Error checking agent online status:`, (error as Error).message);
      return false;
    }
  }

  async getAgentSocketIds(agentId: string): Promise<string[]> {
    try {
      return await this.redis.smembers(`presence:agent:${agentId}`);
    } catch (error) {
      this.logger.error(`Error getting agent socket IDs:`, (error as Error).message);
      return [];
    }
  }

  async getAllOnlineAgents(): Promise<string[]> {
    try {
      const keys = await this.redis.keys('presence:agent:*');
      return keys.map((key) => key.replace('presence:agent:', ''));
    } catch (error) {
      this.logger.error(`Error getting all online agents:`, (error as Error).message);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Conversation participant tracking
  // ---------------------------------------------------------------------------

  async joinConversation(conversationId: string, participantId: string): Promise<void> {
    try {
      await this.redis.sadd(`conversation:${conversationId}:users`, participantId);
      await this.redis.expire(`conversation:${conversationId}:users`, 86400);
    } catch (error) {
      this.logger.error(`Error joining conversation:`, (error as Error).message);
    }
  }

  async leaveConversation(conversationId: string, participantId: string): Promise<void> {
    try {
      await this.redis.srem(`conversation:${conversationId}:users`, participantId);
    } catch (error) {
      this.logger.error(`Error leaving conversation:`, (error as Error).message);
    }
  }

  async getOnlineUsersInConversation(conversationId: string): Promise<string[]> {
    try {
      const userIds = await this.redis.smembers(`conversation:${conversationId}:users`);
      const onlineUsers: string[] = [];
      for (const userId of userIds) {
        if (await this.isUserOnline(userId)) {
          onlineUsers.push(userId);
        }
      }
      return onlineUsers;
    } catch (error) {
      this.logger.error(`Error getting online users in conversation:`, (error as Error).message);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Socket session registry
  // ---------------------------------------------------------------------------

  async setSocketSession(socketId: string, data: SocketSessionData): Promise<void> {
    try {
      await this.redis.hset(
        `socket:session:${socketId}`,
        'type', data.type,
        'actorId', data.actorId,
        'conversationId', data.conversationId,
        'connectedAt', data.connectedAt,
      );
      await this.redis.expire(`socket:session:${socketId}`, 3600);
    } catch (error) {
      this.logger.error(`Error setting socket session:`, (error as Error).message);
    }
  }

  async updateSocketConversation(socketId: string, conversationId: string): Promise<void> {
    try {
      await this.redis.hset(`socket:session:${socketId}`, 'conversationId', conversationId);
      await this.redis.expire(`socket:session:${socketId}`, 3600);
    } catch (error) {
      this.logger.error(`Error updating socket conversation:`, (error as Error).message);
    }
  }

  async removeSocketSession(socketId: string, conversationId?: string): Promise<void> {
    try {
      await this.redis.del(`socket:session:${socketId}`);
      if (conversationId) {
        await this.redis.srem(`conversation:sockets:${conversationId}`, socketId);
      }
    } catch (error) {
      this.logger.error(`Error removing socket session:`, (error as Error).message);
    }
  }

  async getSocketSession(socketId: string): Promise<SocketSessionData | null> {
    try {
      const data = await this.redis.hgetall(`socket:session:${socketId}`);
      if (!data || !data.type) return null;
      return data as unknown as SocketSessionData;
    } catch (error) {
      this.logger.error(`Error getting socket session:`, (error as Error).message);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Conversation socket set
  // ---------------------------------------------------------------------------

  async addSocketToConversation(conversationId: string, socketId: string): Promise<void> {
    try {
      await this.redis.sadd(`conversation:sockets:${conversationId}`, socketId);
      await this.redis.expire(`conversation:sockets:${conversationId}`, 86400);
    } catch (error) {
      this.logger.error(`Error adding socket to conversation:`, (error as Error).message);
    }
  }

  async removeSocketFromConversation(conversationId: string, socketId: string): Promise<void> {
    try {
      await this.redis.srem(`conversation:sockets:${conversationId}`, socketId);
    } catch (error) {
      this.logger.error(`Error removing socket from conversation:`, (error as Error).message);
    }
  }

  async getConversationSockets(conversationId: string): Promise<string[]> {
    try {
      return await this.redis.smembers(`conversation:sockets:${conversationId}`);
    } catch (error) {
      this.logger.error(`Error getting conversation sockets:`, (error as Error).message);
      return [];
    }
  }

  async getAllActiveConversationIds(): Promise<string[]> {
    try {
      const keys = await this.redis.keys('conversation:sockets:*');
      return keys.map((key) => key.replace('conversation:sockets:', ''));
    } catch (error) {
      this.logger.error(`Error getting active conversation IDs:`, (error as Error).message);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Agent heartbeat / status tracking
  // ---------------------------------------------------------------------------

  async setAgentStatus(agentId: string, data: AgentStatusData): Promise<void> {
    try {
      await this.redis.hset(
        `agent:status:${agentId}`,
        'status', data.status,
        'lastHeartbeat', data.lastHeartbeat,
        'conversationId', data.conversationId,
        'metrics', data.metrics ?? '',
      );
      await this.redis.expire(`agent:status:${agentId}`, 300);
    } catch (error) {
      this.logger.error(`Error setting agent status:`, (error as Error).message);
    }
  }

  async getAgentStatus(agentId: string): Promise<AgentStatusData | null> {
    try {
      const data = await this.redis.hgetall(`agent:status:${agentId}`);
      if (!data || !data.status) return null;
      return data as unknown as AgentStatusData;
    } catch (error) {
      this.logger.error(`Error getting agent status:`, (error as Error).message);
      return null;
    }
  }

  async clearAgentStatus(agentId: string): Promise<void> {
    try {
      await this.redis.del(`agent:status:${agentId}`);
    } catch (error) {
      this.logger.error(`Error clearing agent status:`, (error as Error).message);
    }
  }

  // ---------------------------------------------------------------------------
  // Stale cleanup
  // ---------------------------------------------------------------------------

  async cleanupStalePresence(): Promise<void> {
    try {
      const userKeys = await this.redis.keys('presence:user:*');
      const agentKeys = await this.redis.keys('presence:agent:*');
      let cleaned = 0;
      for (const key of [...userKeys, ...agentKeys]) {
        if ((await this.redis.scard(key)) === 0) {
          await this.redis.del(key);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        this.logger.log(`Cleaned up ${cleaned} stale presence keys`);
      }
    } catch (error) {
      this.logger.error(`Error cleaning up stale presence:`, (error as Error).message);
    }
  }
}
