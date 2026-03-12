import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

/**
 * ChatService - Business logic for chat functionality
 *
 * Redis keys:
 * - presence:user:{userId} - Set of socket IDs for online user
 * - presence:agent:{agentId} - Set of socket IDs for online agent
 * - conversation:{conversationId}:users - Set of online user IDs in conversation
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRedis() private readonly redis: Redis,
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
