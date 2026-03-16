import { Logger } from '@nestjs/common';
import { Connection, ConnectionLogLevel } from '../connection/connection.schema';
import { ActionService } from '../action/action.service';
import { ActionType } from '../action/action.enum';
import { RoutingService } from './routing.service';
import { BaseAdapter, NormalizedInbound } from './adapters/base.adapter';
import { DiscordAdapter } from './adapters/discord.adapter';
import { TelegramAdapter } from './adapters/telegram.adapter';

export type AddLogFn = (level: ConnectionLogLevel, message: string, data?: Record<string, unknown>) => void;

/**
 * ConnectionRunner — manages the full lifecycle of one Connection.
 * - Instantiates the correct adapter (Discord/Telegram)
 * - Receives normalized messages, resolves routing, logs Action
 * - Listens for outbound actions and forwards responses to platform
 */
export class ConnectionRunner {
  private readonly logger = new Logger(ConnectionRunner.name);
  private adapter: BaseAdapter | null = null;
  private running = false;

  constructor(
    private readonly connection: Connection,
    private readonly actionService: ActionService,
    private readonly routingService: RoutingService,
    private readonly onOutbound: (conversationId: string, handler: OutboundHandler) => void,
    private readonly offOutbound: (conversationId: string) => void,
    private readonly onAgentJoinRoom: (agentId: string, conversationId: string) => void,
    private readonly onMessageNew: (payload: {
      conversationId: string;
      agentId: string;
      orgId: string;
      role: string;
      content: string;
      userId?: string;
      username?: string;
      fullname?: string;
      externalUsername: string;
      externalUserId: string;
      channelId: string;
      guildId?: string;
    }) => void,
    private readonly addLogFn: AddLogFn,
  ) {}

  /** Fire-and-forget log to connection.logs (never throws) */
  private writeLog(level: ConnectionLogLevel, message: string, data?: Record<string, unknown>): void {
    this.addLogFn(level, message, data);
  }

  async start(): Promise<void> {
    this.adapter = this._createAdapter();

    this.adapter.on('message', (msg: NormalizedInbound) => this._handleInbound(msg));
    this.adapter.on('connected', () => {
      this.logger.log(`Connection [${this.connection.provider}] "${this.connection.name}" connected`);
      this.writeLog('info', `Connected to ${this.connection.provider}`);
    });
    this.adapter.on('disconnected', (reason: string) => {
      this.logger.warn(`Connection [${this.connection.provider}] disconnected: ${reason}`);
      this.writeLog('warn', `Disconnected from ${this.connection.provider}`, { reason });
    });
    this.adapter.on('error', (err: Error) => {
      this.logger.error(`Connection [${this.connection.provider}] error:`, err.message);
      this.writeLog('error', `Adapter error: ${err.message}`);
    });

    this.writeLog('info', 'Runner starting');
    await this.adapter.start();
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    this.writeLog('info', 'Runner stopped');
    await this.adapter?.stop();
    this.adapter = null;
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Send a response back to the platform (called by ConnectionWorkerService).
   */
  async sendResponse(channelId: string, text: string): Promise<void> {
    if (!this.adapter) return;
    await this.adapter.send({ channelId }, text);
  }

  private async _handleInbound(msg: NormalizedInbound): Promise<void> {
    try {
      const resolved = await this.routingService.resolve(msg, this.connection);
      if (!resolved) {
        this.writeLog('info', `No route matched for channel ${msg.channelId}`, { provider: msg.provider, user: msg.externalUsername });
        return;
      }

      const connectionId = String((this.connection as any)._id);
      const orgId = (this.connection as any).owner?.orgId || '';

      // Log inbound action (full audit)
      await this.actionService.createActionDirect(
        {
          conversationId: resolved.conversationId,
          connectionId,
          type: ActionType.MESSAGE,
          actor: resolved.actor,
          content: msg.text,
          metadata: {
            attachments: msg.attachments,
            raw: msg.raw,
          },
        },
        { orgId, agentId: resolved.agentId },
      );

      // Register outbound handler for this conversation
      this.onOutbound(resolved.conversationId, async (responseText: string) => {
        await this.sendResponse(msg.channelId, responseText);
      });

      // Signal ChatGateway (any api instance) to force agent into the conversation room
      this.onAgentJoinRoom(resolved.agentId, resolved.conversationId);

      // Publish message to ChatGateway so it saves Message record + broadcasts message:new to room
      this.onMessageNew({
        conversationId: resolved.conversationId,
        agentId: resolved.agentId,
        orgId,
        role: 'user',
        content: msg.text,
        userId: resolved.iamUserId,
        username: resolved.iamUsername,
        fullname: resolved.iamFullname,
        externalUsername: msg.externalUsername,
        externalUserId: msg.externalUserId,
        channelId: msg.channelId,
        guildId: msg.guildId,
      });

      this.logger.debug(
        `Inbound [${msg.provider}] ${msg.externalUsername} → agent ${resolved.agentId} conv ${resolved.conversationId}`,
      );
      this.writeLog('info', `Inbound message routed`, {
        provider: msg.provider,
        user: msg.externalUsername,
        agentId: resolved.agentId,
        conversationId: resolved.conversationId,
      });
    } catch (err: any) {
      this.logger.error(`Failed to handle inbound message: ${err.message}`, err.stack);
      this.writeLog('error', `Failed to handle inbound message: ${err.message}`);
    }
  }

  private _createAdapter(): BaseAdapter {
    switch (this.connection.provider) {
      case 'discord':
        return new DiscordAdapter(this.connection.config);
      case 'telegram':
        return new TelegramAdapter(this.connection.config);
      default:
        throw new Error(`Unsupported provider: ${this.connection.provider}`);
    }
  }
}

export type OutboundHandler = (text: string) => Promise<void>;
