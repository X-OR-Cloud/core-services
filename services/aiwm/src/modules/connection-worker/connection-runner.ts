import { Logger } from '@nestjs/common';
import { Connection, ConnectionLogLevel } from '../connection/connection.schema';
import { ActionService } from '../action/action.service';
import { ActionType } from '../action/action.enum';
import { RoutingService } from './routing.service';
import { BaseAdapter, EmbedPayload, FilePayload, NormalizedAttachment, NormalizedInbound } from './adapters/base.adapter';
import { DiscordAdapter } from './adapters/discord.adapter';
import { TelegramAdapter } from './adapters/telegram.adapter';
import { TeamsAdapter } from './adapters/teams.adapter';

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
  private readonly seenExternalMessageIds = new Set<string>();

  constructor(
    private readonly connection: Connection,
    private readonly actionService: ActionService,
    private readonly routingService: RoutingService,
    private readonly onOutbound: (conversationId: string, handler: OutboundHandler, verboseActions?: string[], verboseLogsChannelId?: string) => void,
    private readonly offOutbound: (conversationId: string) => void,
    private readonly onAgentJoinRoom: (agentId: string, conversationId: string) => void,
    private readonly onMessageNew: (payload: {
      actionId: string;
      conversationId: string;
      agentId: string;
      orgId: string;
      role: string;
      content: string;
      attachments?: NormalizedAttachment[];
      userId?: string;
      username?: string;
      fullname?: string;
      externalUsername: string;
      externalUserId: string;
      channelId: string;
      serverId?: string;
      connectionId: string;
      platform: string;
    }) => void,
    private readonly onCommand: (payload: { agentId: string; conversationId: string; command: string; reason?: string }) => void,
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

  /** Proactive send to a specific channel (no conversation context needed). */
  async sendDirect(channelId: string, text: string): Promise<void> {
    if (!this.adapter) throw new Error('Runner adapter is not running');
    await this.adapter.send({ channelId }, text);
  }

  /** Proactive file send to a specific channel. */
  async sendDirectFile(channelId: string, file: FilePayload): Promise<void> {
    if (!this.adapter) throw new Error('Runner adapter is not running');
    await this.adapter.sendFile({ channelId }, file);
  }

  /** Proactive embed send to a specific channel. */
  async sendDirectEmbed(channelId: string, embed: EmbedPayload): Promise<void> {
    if (!this.adapter) throw new Error('Runner adapter is not running');
    await this.adapter.sendEmbed({ channelId }, embed);
  }

  async sendTyping(channelId: string): Promise<void> {
    if (!this.adapter) return;
    await this.adapter.sendTyping({ channelId });
  }

  private async _handleInbound(msg: NormalizedInbound): Promise<void> {
    try {
      // Dedup: skip if this platform message ID was already processed (e.g. Discord emits messageCreate twice on reconnect)
      if (msg.externalMessageId) {
        const dedupKey = `${msg.channelId}:${msg.externalMessageId}`;
        if (this.seenExternalMessageIds.has(dedupKey)) {
          this.logger.warn(`Duplicate inbound message skipped: ${dedupKey}`);
          return;
        }
        this.seenExternalMessageIds.add(dedupKey);
        if (this.seenExternalMessageIds.size > 500) {
          this.seenExternalMessageIds.delete(this.seenExternalMessageIds.values().next().value!);
        }
      }

      const { resolved, skipReasons } = await this.routingService.resolve(msg, this.connection);
      if (!resolved) {
        this.writeLog('warn', `No route matched for channel ${msg.channelId}`, {
          provider: msg.provider,
          user: msg.externalUsername,
          serverId: msg.serverId ?? null,
          channelId: msg.channelId,
          isMention: msg.isMention,
          totalRoutes: this.connection.routes.length,
          skipReasons,
        });
        return;
      }

      const connectionId = String((this.connection as any)._id);
      const orgId = (this.connection as any).owner?.orgId || '';

      // Intercept slash commands — do not forward to agent as regular message
      const slashMatch = msg.text.match(/^\/(\w+)(?:\s+(.*))?$/);
      if (slashMatch) {
        const command = slashMatch[1].toLowerCase();
        const reason = slashMatch[2]?.trim();
        if (['stop', 'reload', 'inspect'].includes(command)) {
          this.onCommand({ agentId: resolved.agentId, conversationId: resolved.conversationId, command, reason });
          this.writeLog('info', `Slash command /${command} forwarded to agent`, { command, conversationId: resolved.conversationId });
          return;
        }
      }

      // Log inbound action (full audit)
      const savedAction = await this.actionService.createActionDirect(
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
      const actionId = String((savedAction as any)._id);

      // Register outbound handler for this conversation
      this.onOutbound(resolved.conversationId, async (responseText: string) => {
        await this.sendResponse(msg.channelId, responseText);
      }, resolved.verboseActions, resolved.verboseLogsChannelId);

      // Signal ChatGateway (any api instance) to force agent into the conversation room
      this.onAgentJoinRoom(resolved.agentId, resolved.conversationId);

      // Publish message to ChatGateway — actionId allows AgentRunner to deduplicate across multiple sockets
      this.onMessageNew({
        actionId,
        conversationId: resolved.conversationId,
        agentId: resolved.agentId,
        orgId,
        role: 'user',
        content: msg.text,
        attachments: msg.attachments,
        userId: resolved.iamUserId,
        username: resolved.iamUsername,
        fullname: resolved.iamFullname,
        externalUsername: msg.externalUsername,
        externalUserId: msg.externalUserId,
        channelId: msg.channelId,
        serverId: msg.serverId,
        connectionId,
        platform: this.connection.provider,
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
      case 'teams':
        return new TeamsAdapter(this.connection.config);
      default:
        throw new Error(`Unsupported provider: ${this.connection.provider}`);
    }
  }

  /**
   * Process a raw Teams Activity payload forwarded from Redis by ConnectionWorkerService.
   * Delegates to TeamsAdapter.processActivity() which normalizes and emits 'message'.
   */
  handleTeamsActivity(body: Record<string, any>): void {
    if (this.adapter instanceof TeamsAdapter) {
      this.adapter.processActivity(body);
    }
  }
}

export type OutboundHandler = (text: string) => Promise<void>;
