import { Injectable, Logger } from '@nestjs/common';
import { Connection, ConnectionRoute } from '../connection/connection.schema';
import { NormalizedInbound } from './adapters/base.adapter';
import { Actor } from '../action/action.schema';
import { ActorRole } from '../action/action.enum';
import { ConversationService } from '../conversation/conversation.service';
import { IamLookupService } from './iam-lookup.service';
import { AgentService } from '../agent/agent.service';

export interface ResolvedRoute {
  agentId: string;
  conversationId: string;
  actor: Actor;
  iamUserId?: string;
  iamUsername?: string;
  iamFullname?: string;
  verboseActions?: string[];
  verboseLogsChannelId?: string;
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly conversationService: ConversationService,
    private readonly iamLookupService: IamLookupService,
    private readonly agentService: AgentService,
  ) {}

  /**
   * Resolve incoming message to a target agent and conversation.
   * Returns null if no matching route found, along with skip reasons for debugging.
   */
  async resolve(
    msg: NormalizedInbound,
    connection: Connection,
  ): Promise<{ resolved: ResolvedRoute; skipReasons: string[] } | { resolved: null; skipReasons: string[] }> {
    const { route, skipReasons } = this._matchRoute(msg, connection.routes);
    if (!route) {
      this.logger.debug(
        `No matching route for ${msg.provider}:${msg.channelId} in connection ${(connection as any)._id}. Skip reasons: ${skipReasons.join(' | ')}`,
      );
      return { resolved: null, skipReasons };
    }

    // Lookup IAM user by external identity
    let iamUserId: string | undefined;
    let iamUsername: string | undefined;
    let iamFullname: string | undefined;
    let iamUserType: 'anonymous' | 'authenticated' = 'anonymous';
    if (msg.provider === 'discord' && msg.externalUserId) {
      const iamUser = await this.iamLookupService.findByDiscordId(msg.externalUserId);
      if (iamUser) {
        iamUserId = iamUser.id;
        iamUsername = iamUser.username;
        iamFullname = iamUser.fullname;
        iamUserType = 'authenticated';
        this.logger.debug(`Linked Discord user ${msg.externalUserId} → IAM ${iamUser.id} (${iamUser.username})`);
      }
    }

    // Build conversation key: prefer IAM userId, fallback to external composite ID
    const conversationUserId = iamUserId ?? `${msg.provider}:${msg.externalUserId}`;
    const orgId = (connection as any).owner?.orgId || '';

    // Read conversationMode from agent (single source of truth across WS and Connection Worker)
    const agent = await this.agentService.findById(route.agentId as any, {} as any);
    const conversationMode = (agent as any)?.conversationMode ?? 'per-user';
    const sessionTimeoutMs = (agent as any)?.sessionTimeoutMs ?? 1800000;

    const conversation = await this.conversationService.resolveConversation({
      orgId,
      agentId: route.agentId,
      userId: conversationUserId,
      mode: conversationMode,
      sessionTimeoutMs,
      userType: iamUserType,
    });

    const actor: Actor = {
      role: ActorRole.USER,
      userId: iamUserId,
      displayName: msg.externalUsername,
      externalProvider: msg.provider,
      externalId: msg.externalUserId,
      externalUsername: msg.externalUsername,
    };

    return {
      resolved: {
        agentId: route.agentId,
        conversationId: String((conversation as any)._id),
        actor,
        iamUserId,
        iamUsername,
        iamFullname,
        verboseActions: route.verboseActions,
        verboseLogsChannelId: route.verboseLogsChannelId,
      },
      skipReasons,
    };
  }

  _matchRoute(msg: NormalizedInbound, routes: ConnectionRoute[]): { route: ConnectionRoute | null; skipReasons: string[] } {
    this.logger.debug(
      `Matching msg: provider=${msg.provider} serverId=${msg.serverId} channelId=${msg.channelId} isMention=${msg.isMention} against ${routes.length} route(s)`,
    );

    const skipReasons: string[] = [];

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];

      // serverId filter (Discord: guildId | Teams: teamId)
      if (route.serverId && msg.serverId !== route.serverId) {
        const reason = `Route[${i}] skip: serverId mismatch (route=${route.serverId}, msg=${msg.serverId ?? 'undefined'})`;
        this.logger.debug(reason);
        skipReasons.push(reason);
        continue;
      }

      // channelId filter
      if (route.channelId && msg.channelId !== route.channelId) {
        const reason = `Route[${i}] skip: channelId mismatch (route=${route.channelId}, msg=${msg.channelId})`;
        this.logger.debug(reason);
        skipReasons.push(reason);
        continue;
      }

      // requireMention filter
      if (route.requireMention && !msg.isMention) {
        const reason = `Route[${i}] skip: requireMention=true but isMention=false`;
        this.logger.debug(reason);
        skipReasons.push(reason);
        continue;
      }

      this.logger.debug(`Route[${i}] matched: agentId=${route.agentId}`);
      return { route, skipReasons };
    }

    // Fallback: first route with no filters (catch-all)
    const catchAll = routes.find((r) => !r.serverId && !r.channelId) ?? null;
    this.logger.debug(catchAll ? `Fallback catch-all matched: agentId=${catchAll.agentId}` : 'No catch-all route found');
    return { route: catchAll, skipReasons };
  }
}
