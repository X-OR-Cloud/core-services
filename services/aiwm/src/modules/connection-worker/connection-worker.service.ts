import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConnectionService } from '../connection/connection.service';
import { ActionService } from '../action/action.service';
import { RoutingService } from './routing.service';
import { ConnectionRunner, OutboundHandler } from './connection-runner';
import { redisConfig } from '../../config/redis.config';

const HEALTH_CHECK_INTERVAL_MS = 30_000;
const CHANNEL_OUTBOUND = 'outbound:message';
const CHANNEL_AGENT_JOIN = 'agent:join-room';
const CHANNEL_MESSAGE_NEW = 'chat:message-new';

/**
 * ConnectionWorkerService — orchestrates all active ConnectionRunners.
 * Runs in `con` worker mode.
 */
@Injectable()
export class ConnectionWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectionWorkerService.name);
  private readonly runners = new Map<string, ConnectionRunner>();
  private readonly outboundHandlers = new Map<string, OutboundHandler>();
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private redisPub: Redis | null = null;
  private redisSub: Redis | null = null;

  constructor(
    private readonly connectionService: ConnectionService,
    private readonly actionService: ActionService,
    private readonly routingService: RoutingService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.redisPub = new Redis(redisConfig);
    this.redisSub = new Redis(redisConfig);

    await this.redisSub.subscribe(CHANNEL_OUTBOUND);
    this.redisSub.on('message', async (channel, message) => {
      if (channel === CHANNEL_OUTBOUND) {
        try {
          const { conversationId, text } = JSON.parse(message);
          await this.handleOutbound(conversationId, text);
        } catch (err: any) {
          this.logger.error(`Failed to process outbound:message: ${err.message}`);
        }
      }
    });

    await this.spawnConnections();
    this.startHealthCheck();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    await Promise.all([...this.runners.values()].map((r) => r.stop()));
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
    conversationId: string;
    agentId: string;
    orgId: string;
    role: string;
    content: string;
    externalUsername: string;
  }): Promise<void> {
    // msgNonce is a unique ID per publish so multi-instance WS gateways can lock on it
    const msgNonce = `${payload.conversationId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    this.redisPub?.publish(CHANNEL_MESSAGE_NEW, JSON.stringify({ ...payload, msgNonce })).catch((err: Error) =>
      this.logger.error(`Failed to publish chat:message-new: ${err.message}`),
    );
  }

  /**
   * Called by ChatGateway (or event listener) when agent emits a response.
   * Forwards the response to the correct external platform.
   */
  async handleOutbound(conversationId: string, text: string): Promise<void> {
    const handler = this.outboundHandlers.get(conversationId);
    if (handler) {
      await handler(text).catch((err) =>
        this.logger.error(`Failed to forward outbound to ${conversationId}: ${err.message}`),
      );
    }
  }

  private async spawnConnections(): Promise<void> {
    const connections = await this.connectionService.getActiveConnections();
    this.logger.log(`Found ${connections.length} active connection(s) to spawn`);

    for (const connection of connections) {
      await this.spawnRunner(connection);
    }
  }

  private async spawnRunner(connection: any): Promise<void> {
    const id = String(connection._id);
    if (this.runners.has(id)) return;

    const runner = new ConnectionRunner(
      connection,
      this.actionService,
      this.routingService,
      (conversationId, handler) => this.outboundHandlers.set(conversationId, handler),
      (conversationId) => this.outboundHandlers.delete(conversationId),
      (agentId, conversationId) => this.publishAgentJoinRoom(agentId, conversationId),
      (payload) => this.publishMessageNew(payload),
    );

    try {
      await runner.start();
      this.runners.set(id, runner);
      this.logger.log(`Runner started for connection ${id} [${connection.provider}] "${connection.name}"`);
    } catch (err: any) {
      this.logger.error(`Failed to start runner for connection ${id}: ${err.message}`);
    }
  }

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.reconcile();
    }, HEALTH_CHECK_INTERVAL_MS);
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
      }
    }

    // Start runners for new active connections
    for (const connection of activeConnections) {
      const id = String((connection as any)._id);
      if (!this.runners.has(id)) {
        await this.spawnRunner(connection);
      }
    }
  }
}
