import { Controller, Get, Post, Param, Query, Body, Headers, HttpCode, HttpStatus, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import Redis from 'ioredis';
import { ConnectionService } from './connection.service';
import { redisConfig } from '../../config/redis.config';
import { verifyTeamsJwt } from './teams-jwt.verifier';

const CHANNEL_INBOUND_TEAMS = (connectionId: string) => `inbound:teams:${connectionId}`;

/**
 * TeamsWebhookController — receives Microsoft Teams Activity payloads.
 *
 * Two endpoints:
 *   GET  /connections/:id/webhook  — URL validation challenge (Teams sends ?validationToken=...)
 *   POST /connections/:id/webhook  — incoming Activity from Teams Bot Service
 *
 * On POST: validates the connection exists and is active, then publishes the raw
 * Activity to Redis channel `inbound:teams:{connectionId}` for the con worker to process.
 */
@ApiTags('connections')
@Controller('connections')
export class TeamsWebhookController {
  private readonly logger = new Logger(TeamsWebhookController.name);
  private readonly redis: Redis;

  constructor(private readonly connectionService: ConnectionService) {
    this.redis = new Redis(redisConfig);
  }

  /**
   * Teams URL validation challenge.
   * When you register a bot endpoint, Teams sends a GET with ?validationToken=xxx.
   * The server must respond with the token as plain text.
   */
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

  /**
   * Teams Activity webhook.
   * Teams Bot Service POSTs Activity objects here when a user sends a message.
   */
  @Post(':id/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive Teams Activity webhook' })
  async teamsWebhook(
    @Param('id') id: string,
    @Body() body: Record<string, any>,
    @Headers('authorization') authorization: string,
  ): Promise<void> {
    const connection = await this.connectionService.findByIdInternal(id);
    if (!connection) {
      throw new NotFoundException(`Connection ${id} not found`);
    }
    if ((connection as any).status !== 'active') {
      // Silently accept but don't process — Teams expects 200 OK
      this.logger.debug(`Connection ${id} is not active, ignoring Teams activity`);
      return;
    }
    if ((connection as any).provider !== 'teams') {
      throw new BadRequestException(`Connection ${id} is not a Teams connection`);
    }

    const appId = (connection as any).config?.appId;
    if (!appId) {
      throw new BadRequestException(`Connection ${id} has no appId configured`);
    }
    await verifyTeamsJwt(authorization, appId);

    this.logger.debug(`Teams activity received for connection ${id}: type=${body.type}`);

    await this.redis.publish(
      CHANNEL_INBOUND_TEAMS(id),
      JSON.stringify(body),
    );
  }
}
