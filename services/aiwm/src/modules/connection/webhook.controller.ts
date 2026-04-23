import { Controller, Get, Post, Param, Query, Body, Headers, HttpCode, HttpStatus, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import Redis from 'ioredis';
import { ConnectionService } from './connection.service';
import { redisConfig } from '../../config/redis.config';
import { verifyTeamsJwt } from './teams-jwt.verifier';

const CHANNEL_INBOUND_TEAMS = (id: string) => `inbound:teams:${id}`;
const CHANNEL_INBOUND_ZALO_BOT = (id: string) => `inbound:zalo-bot:${id}`;

/**
 * WebhookController — unified webhook endpoint for all connection providers.
 *
 * GET  /connections/:id/webhook  — URL validation challenge (Teams only)
 * POST /connections/:id/webhook  — incoming event; dispatched by provider
 */
@ApiTags('connections')
@Controller('connections')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly redis: Redis;

  constructor(private readonly connectionService: ConnectionService) {
    this.redis = new Redis(redisConfig);
  }

  @Get(':id/webhook')
  @ApiOperation({ summary: 'Teams webhook URL validation challenge' })
  teamsValidation(
    @Param('id') id: string,
    @Query('validationToken') validationToken: string,
  ): string {
    if (!validationToken) {
      throw new BadRequestException('Missing validationToken');
    }
    this.logger.log(`Teams validation challenge for connection ${id}`);
    return validationToken;
  }

  @Post(':id/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive webhook event for any connection provider' })
  async handleWebhook(
    @Param('id') id: string,
    @Body() body: Record<string, any>,
    @Headers() headers: Record<string, string>,
  ): Promise<void> {
    const connection = await this.connectionService.findByIdInternal(id);
    if (!connection) {
      throw new NotFoundException(`Connection ${id} not found`);
    }

    const provider: string = (connection as any).provider;

    switch (provider) {
      case 'teams':
        await this._handleTeams(id, connection, body, headers['authorization']);
        break;
      case 'zalo-bot':
        await this._handleZaloBot(id, connection, body, headers['x-bot-api-secret-token']);
        break;
      default:
        throw new BadRequestException(`Provider "${provider}" does not support webhooks`);
    }
  }

  private async _handleTeams(
    id: string,
    connection: any,
    body: Record<string, any>,
    authorization: string,
  ): Promise<void> {
    if (connection.status !== 'active') {
      this.logger.debug(`Connection ${id} is not active, ignoring Teams activity`);
      return;
    }
    const appId = connection.config?.appId;
    if (!appId) {
      throw new BadRequestException(`Connection ${id} has no appId configured`);
    }
    await verifyTeamsJwt(authorization, appId);
    this.logger.debug(`Teams activity received for connection ${id}: type=${body.type}`);
    await this.redis.publish(CHANNEL_INBOUND_TEAMS(id), JSON.stringify(body));
  }

  private async _handleZaloBot(
    id: string,
    connection: any,
    body: Record<string, any>,
    secretToken: string | undefined,
  ): Promise<void> {
    if (connection.status !== 'active') {
      this.logger.debug(`Connection ${id} is not active, ignoring Zalo Bot event`);
      return;
    }
    const expectedSecret: string | undefined = connection.config?.zaloSecretToken;
    if (expectedSecret && secretToken !== expectedSecret) {
      throw new BadRequestException('Invalid X-Bot-Api-Secret-Token');
    }
    this.logger.debug(`Zalo Bot event received for connection ${id}: event=${body?.result?.event_name}`);
    await this.redis.publish(CHANNEL_INBOUND_ZALO_BOT(id), JSON.stringify(body));
  }
}
