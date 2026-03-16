import { Injectable, Logger } from '@nestjs/common';
import { Connection, ConnectionRoute } from '../connection/connection.schema';
import { NormalizedInbound } from './adapters/base.adapter';
import { Actor } from '../action/action.schema';
import { ActorRole } from '../action/action.enum';
import { ConversationService } from '../conversation/conversation.service';
import { IamLookupService } from './iam-lookup.service';

export interface ResolvedRoute {
  agentId: string;
  conversationId: string;
  actor: Actor;
  iamUserId?: string;
  iamUsername?: string;
  iamFullname?: string;
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly conversationService: ConversationService,
    private readonly iamLookupService: IamLookupService,
  ) {}

  /**
   * Resolve incoming message to a target agent and conversation.
   * Returns null if no matching route found.
   */
  async resolve(
    msg: NormalizedInbound,
    connection: Connection,
  ): Promise<ResolvedRoute | null> {
    const route = this._matchRoute(msg, connection.routes);
    if (!route) {
      this.logger.debug(
        `No matching route for ${msg.provider}:${msg.channelId} in connection ${(connection as any)._id}`,
      );
      return null;
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

    const conversation = await this.conversationService.findOrCreateForUser(
      conversationUserId,
      route.agentId,
      (connection as any).owner?.orgId || '',
      iamUserType,
    );

    const actor: Actor = {
      role: ActorRole.USER,
      userId: iamUserId,
      displayName: msg.externalUsername,
      externalProvider: msg.provider,
      externalId: msg.externalUserId,
      externalUsername: msg.externalUsername,
    };

    return {
      agentId: route.agentId,
      conversationId: String((conversation as any)._id),
      actor,
      iamUserId,
      iamUsername,
      iamFullname,
    };
  }

  private _matchRoute(msg: NormalizedInbound, routes: ConnectionRoute[]): ConnectionRoute | null {
    this.logger.debug(
      `Matching msg: provider=${msg.provider} guildId=${msg.guildId} channelId=${msg.channelId} isMention=${msg.isMention} against ${routes.length} route(s)`,
    );

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];

      // guildId filter (Discord only)
      if (route.guildId && msg.guildId !== route.guildId) {
        this.logger.debug(`Route[${i}] skip: guildId mismatch (route=${route.guildId}, msg=${msg.guildId})`);
        continue;
      }

      // channelId filter
      if (route.channelId && msg.channelId !== route.channelId) {
        this.logger.debug(`Route[${i}] skip: channelId mismatch (route=${route.channelId}, msg=${msg.channelId})`);
        continue;
      }

      // requireMention filter
      if (route.requireMention && !msg.isMention) {
        this.logger.debug(`Route[${i}] skip: requireMention=true but isMention=false`);
        continue;
      }

      this.logger.debug(`Route[${i}] matched: agentId=${route.agentId}`);
      return route;
    }

    // Fallback: first route with no filters (catch-all)
    const catchAll = routes.find((r) => !r.guildId && !r.channelId) ?? null;
    this.logger.debug(catchAll ? `Fallback catch-all matched: agentId=${catchAll.agentId}` : 'No catch-all route found');
    return catchAll;
  }
}
