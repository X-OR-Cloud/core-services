import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConnectionService, CHANNEL_CONNECTION_CHANGED, ConnectionChangedPayload } from '../connection/connection.service';
import { ActionService } from '../action/action.service';
import { RoutingService } from './routing.service';
import { ConversationService } from '../conversation/conversation.service';
import { ConnectionRunner, OutboundHandler } from './connection-runner';
import { ConnectionLockService } from './connection-lock.service';
import { buildRedisConfig } from '../../config/redis.config';

const HEALTH_CHECK_INTERVAL_MS = 30_000;
const TOKEN_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const CHANNEL_OUTBOUND = 'outbound:message';
const CHANNEL_OUTBOUND_TYPING = 'outbound:typing';
const CHANNEL_OUTBOUND_COMMAND = 'outbound:command';
const CHANNEL_OUTBOUND_DIRECT = 'outbound:direct';
const CHANNEL_AGENT_JOIN = 'agent:join-room';
const CHANNEL_MESSAGE_NEW = 'chat:message-new';
const CHANNEL_INBOUND_TEAMS_PATTERN = 'inbound:teams:*';
const CHANNEL_INBOUND_ZALO_BOT_PATTERN = 'inbound:zalo-bot:*';
const CHANNEL_INBOUND_ZALO_OA_PATTERN = 'inbound:zalo-oa:*';

/**
 * ConnectionWorkerService — orchestrates all active ConnectionRunners.
 * Runs in `con` worker mode.
 */
@Injectable()
export class ConnectionWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectionWorkerService.name);
  private readonly runners = new Map<string, ConnectionRunner>();
  private readonly spawning = new Set<string>();
  private readonly outboundHandlers = new Map<string, OutboundHandler>();
  private readonly conversationVerboseActions = new Map<string, string[]>(); // conversationId → verboseActions
  private readonly conversationVerboseLogsChannelId = new Map<string, string>(); // conversationId → verboseLogsChannelId
  private readonly conversationConnectionId = new Map<string, string>(); // conversationId → connectionId
  private readonly typingChannels = new Map<string, { channelId: string; threadId?: string; teamsServiceUrl?: string; teamsConversationId?: string }>(); // conversationId → chat destination
  // Teams conversation refs are persisted in Redis (key: teams:ref:{connectionId}:{channelId})
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private tokenRefreshTimer: NodeJS.Timeout | null = null;
  private redisPub: Redis | null = null;
  private redisSub: Redis | null = null;

  constructor(
    private readonly connectionService: ConnectionService,
    private readonly actionService: ActionService,
    private readonly routingService: RoutingService,
    private readonly conversationService: ConversationService,
    private readonly lockService: ConnectionLockService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.redisPub = new Redis(buildRedisConfig());
    this.redisSub = new Redis(buildRedisConfig());

    await this.lockService.connect();
    await this.redisSub.subscribe(CHANNEL_OUTBOUND, CHANNEL_OUTBOUND_TYPING, CHANNEL_OUTBOUND_DIRECT, CHANNEL_CONNECTION_CHANGED);
    await this.redisSub.psubscribe(CHANNEL_INBOUND_TEAMS_PATTERN, CHANNEL_INBOUND_ZALO_BOT_PATTERN, CHANNEL_INBOUND_ZALO_OA_PATTERN);

    this.redisSub.on('message', async (channel, message) => {
      if (channel === CHANNEL_OUTBOUND) {
        try {
          const { conversationId, text, actionType, sourcePlatform } = JSON.parse(message);
          await this.handleOutbound(conversationId, text, actionType, sourcePlatform);
        } catch (err: any) {
          this.logger.error(`Failed to process outbound:message: ${err.message}`);
        }
      }
      if (channel === CHANNEL_OUTBOUND_TYPING) {
        try {
          const { conversationId } = JSON.parse(message);
          await this.handleOutboundTyping(conversationId);
        } catch (err: any) {
          this.logger.error(`Failed to process outbound:typing: ${err.message}`);
        }
      }
      if (channel === CHANNEL_OUTBOUND_DIRECT) {
        try {
          const { connectionId, channelId, content, embed, file } = JSON.parse(message);
          this.logger.debug(`outbound:direct payload: ${JSON.stringify({ connectionId, channelId, hasContent: !!content, hasEmbed: !!embed, file })}`);
          await this.handleOutboundDirect(connectionId, channelId, content, embed, file);
        } catch (err: any) {
          this.logger.error(`Failed to process outbound:direct: ${err.message}`);
        }
      }
      if (channel === CHANNEL_CONNECTION_CHANGED) {
        try {
          const payload: ConnectionChangedPayload = JSON.parse(message);
          await this.handleConnectionChanged(payload);
        } catch (err: any) {
          this.logger.error(`Failed to process connection:changed: ${err.message}`);
        }
      }
    });

    this.redisSub.on('pmessage', async (_pattern, channel, message) => {
      if (channel.startsWith('inbound:teams:')) {
        const connectionId = channel.replace('inbound:teams:', '');
        try {
          const body = JSON.parse(message);
          const runner = this.runners.get(connectionId);
          if (runner) {
            runner.handleTeamsActivity(body);
          } else {
            this.logger.warn(`No runner found for Teams inbound on connection ${connectionId}`);
          }
        } catch (err: any) {
          this.logger.error(`Failed to process inbound:teams for ${connectionId}: ${err.message}`);
        }
      } else if (channel.startsWith('inbound:zalo-bot:')) {
        const connectionId = channel.replace('inbound:zalo-bot:', '');
        try {
          const body = JSON.parse(message);
          const runner = this.runners.get(connectionId);
          if (runner) {
            runner.handleZaloBotEvent(body);
          } else {
            this.logger.warn(`No runner found for Zalo Bot inbound on connection ${connectionId}`);
          }
        } catch (err: any) {
          this.logger.error(`Failed to process inbound:zalo-bot for ${connectionId}: ${err.message}`);
        }
      } else if (channel.startsWith('inbound:zalo-oa:')) {
        const connectionId = channel.replace('inbound:zalo-oa:', '');
        try {
          const body = JSON.parse(message);
          const runner = this.runners.get(connectionId);
          if (runner) {
            runner.handleZaloOaEvent(body);
          } else {
            this.logger.warn(`No runner found for Zalo OA inbound on connection ${connectionId}`);
          }
        } catch (err: any) {
          this.logger.error(`Failed to process inbound:zalo-oa for ${connectionId}: ${err.message}`);
        }
      }
    });

    await this.spawnConnections();
    this.startHealthCheck();
    this.startTokenRefresh();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    if (this.tokenRefreshTimer) clearInterval(this.tokenRefreshTimer);
    for (const [id, runner] of this.runners) {
      await runner.stop();
      await this.lockService.release(id);
    }
    this.runners.clear();
    this.redisPub?.disconnect();
    this.redisSub?.disconnect();
    this.logger.log('All connection runners stopped');
  }

  async publishAgentJoinRoom(agentId: string, conversationId: string): Promise<void> {
    this.redisPub?.publish(CHANNEL_AGENT_JOIN, JSON.stringify({ agentId, conversationId })).catch((err: Error) =>
      this.logger.error(`Failed to publish agent:join-room: ${err.message}`),
    );
  }

  async publishMessageNew(payload: {
    actionId: string;
    conversationId: string;
    agentId: string;
    orgId: string;
    role: string;
    content: string;
    attachments?: any[];
    userId?: string;
    username?: string;
    fullname?: string;
    externalUsername: string;
    externalUserId: string;
    channelId: string;
    serverId?: string;
    threadId?: string;          // Telegram: message_thread_id (topic)
    teamsServiceUrl?: string;   // Teams only
    teamsConversationId?: string; // Teams only
    connectionId: string;
    platform: string;
    skipAgent?: boolean;
  }): Promise<void> {
    // Track chat destination for this conversation — used to forward typing indicators
    this.typingChannels.set(payload.conversationId, { channelId: payload.channelId, threadId: payload.threadId, teamsServiceUrl: payload.teamsServiceUrl, teamsConversationId: payload.teamsConversationId });

    // Persist Teams conversation reference for proactive send (survives worker restarts)
    if (payload.platform === 'teams' && payload.teamsServiceUrl && payload.teamsConversationId) {
      const refKey = `teams:ref:${payload.connectionId}:${payload.channelId}`;
      this.redisPub?.set(refKey, JSON.stringify({ serviceUrl: payload.teamsServiceUrl, conversationId: payload.teamsConversationId })).catch((err: Error) =>
        this.logger.error(`Failed to save Teams conversation ref: ${err.message}`),
      );
    }

    // msgNonce is a unique ID per publish so multi-instance WS gateways can lock on it
    const msgNonce = `${payload.conversationId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    this.redisPub?.publish(CHANNEL_MESSAGE_NEW, JSON.stringify({ ...payload, msgNonce })).catch((err: Error) =>
      this.logger.error(`Failed to publish chat:message-new: ${err.message}`),
    );
  }

  /**
   * Called by ChatGateway (or event listener) when agent emits a response.
   * Forwards the response to the correct external platform.
   * actionType defaults to 'message' — only 'message' is forwarded unless verboseActions is configured.
   */
  async handleOutbound(conversationId: string, text: string, actionType = 'message', sourcePlatform?: string): Promise<void> {
    if (sourcePlatform === 'portal') return;

    const verboseActions = this.conversationVerboseActions.get(conversationId);
    const isAllowed =
      actionType === 'message' ||
      actionType === 'notice' ||
      (verboseActions && (verboseActions.includes('*') || verboseActions.includes(actionType)));

    if (isAllowed) {
      const handler = this.outboundHandlers.get(conversationId);
      if (handler) {
        await handler(text).catch((err) =>
          this.logger.error(`Failed to forward outbound to ${conversationId}: ${err.message}`),
        );
      }
    }

    // Forward ALL actions to verboseLogsChannelId if configured
    const verboseLogsChannelId = this.conversationVerboseLogsChannelId.get(conversationId);
    if (verboseLogsChannelId) {
      const connectionId = this.conversationConnectionId.get(conversationId);
      const runner = connectionId ? this.runners.get(connectionId) : undefined;
      if (runner) {
        await runner.sendDirect(verboseLogsChannelId, text).catch((err: Error) =>
          this.logger.error(`Failed to forward verbose log to ${verboseLogsChannelId}: ${err.message}`),
        );
      }
    }
  }

  async publishCommand(payload: { agentId: string; conversationId: string; command: string; reason?: string }): Promise<void> {
    this.redisPub?.publish(CHANNEL_OUTBOUND_COMMAND, JSON.stringify(payload)).catch((err: Error) =>
      this.logger.error(`Failed to publish outbound:command: ${err.message}`),
    );
  }

  async handleOutboundDirect(connectionId: string, channelId: string, content?: string, embed?: object, file?: object): Promise<void> {
    const runner = this.runners.get(connectionId);
    if (!runner) {
      this.logger.warn(`outbound:direct — no runner found for connectionId=${connectionId}`);
      return;
    }

    // For Teams: resolve cached conversation reference for proactive send
    const refKey = `teams:ref:${connectionId}:${channelId}`;
    const refRaw = await this.redisPub?.get(refKey);
    const teamsRef = refRaw ? JSON.parse(refRaw) as { serviceUrl: string; conversationId: string } : null;
    const threadId = undefined;
    const teamsServiceUrl = teamsRef?.serviceUrl;
    const teamsConversationId = teamsRef?.conversationId;

    if (file) {
      await runner.sendDirectFile(channelId, file as any, threadId, teamsServiceUrl, teamsConversationId).catch((err: Error) =>
        this.logger.error(`outbound:direct file failed connectionId=${connectionId} channelId=${channelId}: ${err.message}`),
      );
    } else if (embed) {
      await runner.sendDirectEmbed(channelId, embed as any, threadId, teamsServiceUrl, teamsConversationId).catch((err: Error) =>
        this.logger.error(`outbound:direct embed failed connectionId=${connectionId} channelId=${channelId}: ${err.message}`),
      );
    } else if (content) {
      await runner.sendDirect(channelId, content, threadId, teamsServiceUrl, teamsConversationId).catch((err: Error) =>
        this.logger.error(`outbound:direct failed connectionId=${connectionId} channelId=${channelId}: ${err.message}`),
      );
    }
  }

  async handleOutboundTyping(conversationId: string): Promise<void> {
    const target = this.typingChannels.get(conversationId);
    if (!target) return;
    const connectionId = this.conversationConnectionId.get(conversationId);
    const runner = connectionId ? this.runners.get(connectionId) : undefined;
    if (runner) {
      await runner.sendTyping(target.channelId, target.threadId, target.teamsServiceUrl, target.teamsConversationId).catch((err: Error) =>
        this.logger.warn(`Failed to forward typing to ${target.channelId}: ${err.message}`),
      );
    }
  }

  private async spawnConnections(): Promise<void> {
    const connections = await this.connectionService.getActiveConnections();
    this.logger.log(`Found ${connections.length} active connection(s). Competing for locks...`);
    await Promise.allSettled(connections.map((conn) => this.trySpawnRunner(conn)));
  }

  private async trySpawnRunner(connection: any): Promise<void> {
    const id = String(connection._id);
    if (this.runners.has(id) || this.spawning.has(id)) return;
    const acquired = await this.lockService.tryAcquire(id);
    if (!acquired) {
      this.logger.log(`Skipping connection ${id} [${connection.provider}] "${connection.name}" — owned by another instance`);
      return;
    }
    await this.spawnRunner(connection);
  }

  private async spawnRunner(connection: any): Promise<void> {
    const id = String(connection._id);
    if (this.runners.has(id) || this.spawning.has(id)) return;
    this.spawning.add(id);

    try {
      const runner = new ConnectionRunner(
        connection,
        this.actionService,
        this.routingService,
        this.conversationService,
        (conversationId, handler, verboseActions, verboseLogsChannelId) => {
          this.outboundHandlers.set(conversationId, handler);
          this.conversationConnectionId.set(conversationId, id);
          if (verboseActions) this.conversationVerboseActions.set(conversationId, verboseActions);
          if (verboseLogsChannelId) this.conversationVerboseLogsChannelId.set(conversationId, verboseLogsChannelId);
        },
        (conversationId) => {
          this.outboundHandlers.delete(conversationId);
          this.conversationConnectionId.delete(conversationId);
          this.conversationVerboseActions.delete(conversationId);
          this.conversationVerboseLogsChannelId.delete(conversationId);
        },
        (agentId, conversationId) => this.publishAgentJoinRoom(agentId, conversationId),
        (payload) => this.publishMessageNew(payload),
        (payload) => this.publishCommand(payload),
        (level, message, data) =>
          this.connectionService.addLog(id, level, message, data as Record<string, any>).catch(() => undefined),
        this.redisPub!,
      );

      await runner.start();
      this.runners.set(id, runner);
      this.logger.log(`Runner started for connection ${id} [${connection.provider}] "${connection.name}"`);
    } catch (err: any) {
      this.logger.error(`Failed to start runner for connection ${id}: ${err.message}`);
      await this.lockService.release(id);
    } finally {
      this.spawning.delete(id);
    }
  }

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.reconcile();
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private startTokenRefresh(): void {
    this.tokenRefreshTimer = setInterval(async () => {
      for (const [connectionId, runner] of this.runners) {
        const connection = await this.connectionService.getConnectionById(connectionId);
        if (!connection || (connection as any).provider !== 'zalo-oa') continue;
        try {
          const newToken = await this.connectionService.refreshZaloOaToken(connectionId);
          runner.updateZaloOaToken(newToken);
          this.logger.log(`Zalo OA token refreshed for connection ${connectionId}`);
        } catch (err: any) {
          this.logger.error(`Zalo OA token refresh failed for connection ${connectionId}: ${err.message}`);
        }
      }
    }, TOKEN_REFRESH_INTERVAL_MS);
  }

  private async reconcile(): Promise<void> {
    const activeConnections = await this.connectionService.getActiveConnections();
    const activeIds = new Set(activeConnections.map((c: any) => String(c._id)));

    // Stop runners for deactivated connections
    for (const [id, runner] of this.runners) {
      if (!activeIds.has(id)) {
        await runner.stop();
        this.runners.delete(id);
        this.logger.log(`Runner stopped for deactivated connection ${id}`);
        this.connectionService.addLog(id, 'info', 'Runner stopped by health check reconciliation').catch(() => undefined);
      }
    }

    // Stop runners where this instance lost the lock (stolen by another instance after its restart)
    for (const [id, runner] of this.runners) {
      if (!this.lockService.ownsLock(id)) {
        await runner.stop();
        this.runners.delete(id);
        this.logger.warn(`Runner stopped for connection ${id} — lock lost to another instance`);
        this.connectionService.addLog(id, 'warn', 'Runner stopped: lock claimed by another instance').catch(() => undefined);
      }
    }

    // Start runners for new or unlocked connections (new instance + failover)
    for (const connection of activeConnections) {
      const id = String((connection as any)._id);
      if (!this.runners.has(id)) {
        await this.trySpawnRunner(connection);
      }
    }
  }

  private async handleConnectionChanged(payload: ConnectionChangedPayload): Promise<void> {
    const { connectionId, action, status } = payload;
    this.logger.log(`connection:changed [${action}] id=${connectionId} status=${status ?? '-'}`);

    switch (action) {
      case 'created':
        if (status === 'active') {
          const connection = await this.connectionService.getConnectionById(connectionId);
          if (connection) await this.trySpawnRunner(connection);
        }
        break;

      case 'status_changed':
        if (status === 'active') {
          const connection = await this.connectionService.getConnectionById(connectionId);
          if (connection) await this.trySpawnRunner(connection);
        } else {
          await this.stopRunner(connectionId, 'status changed to inactive/error');
        }
        break;

      case 'deleted':
        await this.stopRunner(connectionId, 'connection deleted');
        break;

      case 'updated':
      case 'route_changed':
        if (this.runners.has(connectionId)) {
          await this.restartRunner(connectionId);
        }
        break;
    }
  }

  private async stopRunner(connectionId: string, reason: string): Promise<void> {
    const runner = this.runners.get(connectionId);
    if (!runner) return;
    await runner.stop();
    this.runners.delete(connectionId);
    await this.lockService.release(connectionId);
    this.logger.log(`Runner stopped for connection ${connectionId}: ${reason}`);
    this.connectionService.addLog(connectionId, 'info', `Runner stopped: ${reason}`).catch(() => undefined);
  }

  private async restartRunner(connectionId: string): Promise<void> {
    await this.stopRunner(connectionId, 'config/route changed — restarting');
    const connection = await this.connectionService.getConnectionById(connectionId);
    if (connection && connection.status === 'active') {
      await this.trySpawnRunner(connection);
      this.logger.log(`Runner restarted for connection ${connectionId} after config change`);
    }
  }
}
