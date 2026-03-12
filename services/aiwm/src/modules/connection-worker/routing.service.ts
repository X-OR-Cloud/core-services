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
    let iamUserType: 'anonymous' | 'registered' = 'anonymous';
    if (msg.provider === 'discord' && msg.externalUserId) {
      const iamUser = await this.iamLookupService.findByDiscordId(msg.externalUserId);
      if (iamUser) {
        iamUserId = iamUser.id;
        iamUserType = 'registered';
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
    };
  }

  private _matchRoute(msg: NormalizedInbound, routes: ConnectionRoute[]): ConnectionRoute | null {
    for (const route of routes) {
      // guildId filter (Discord only)
      if (route.guildId && msg.guildId !== route.guildId) continue;

      // channelId filter
      if (route.channelId && msg.channelId !== route.channelId) continue;

      // requireMention filter
      if (route.requireMention && !msg.isMention) continue;

      return route;
    }

    // Fallback: first route with no filters (catch-all)
    return routes.find((r) => !r.guildId && !r.channelId) ?? null;
  }
}
