import { Logger } from '@nestjs/common';
import { Connection } from '../connection/connection.schema';
import { ActionService } from '../action/action.service';
import { ActionType } from '../action/action.enum';
import { RoutingService } from './routing.service';
import { BaseAdapter, NormalizedInbound } from './adapters/base.adapter';
import { DiscordAdapter } from './adapters/discord.adapter';
import { TelegramAdapter } from './adapters/telegram.adapter';

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
      externalUsername: string;
    }) => void,
  ) {}

  async start(): Promise<void> {
    this.adapter = this._createAdapter();

    this.adapter.on('message', (msg: NormalizedInbound) => this._handleInbound(msg));
    this.adapter.on('connected', () => {
      this.logger.log(`Connection [${this.connection.provider}] "${this.connection.name}" connected`);
    });
    this.adapter.on('disconnected', (reason: string) => {
      this.logger.warn(`Connection [${this.connection.provider}] disconnected: ${reason}`);
    });
    this.adapter.on('error', (err: Error) => {
      this.logger.error(`Connection [${this.connection.provider}] error:`, err.message);
    });

    await this.adapter.start();
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
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
      if (!resolved) return;

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
        externalUsername: msg.externalUsername,
      });

      this.logger.debug(
        `Inbound [${msg.provider}] ${msg.externalUsername} → agent ${resolved.agentId} conv ${resolved.conversationId}`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to handle inbound message: ${err.message}`, err.stack);
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
