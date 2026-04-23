import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Redirect,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
  FindManyResult,
  parseQueryString,
  QueryStringParams,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { ConnectionService } from './connection.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { ConnectionRouteDto } from './dto/create-connection.dto';
import { Connection, ConnectionLog } from './connection.schema';

@ApiTags('Connections')
@Controller('connections')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConnectionController {
  constructor(private readonly connectionService: ConnectionService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new connection' })
  @ApiCreateErrors()
  async create(
    @Body() dto: CreateConnectionDto,
    @CurrentUser() context: RequestContext,
  ): Promise<Partial<Connection>> {
    return this.connectionService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List connections with pagination' })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: QueryStringParams,
    @CurrentUser() context: RequestContext,
  ): Promise<FindManyResult<Connection>> {
    return this.connectionService.findAll(parseQueryString(query), context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get connection by ID' })
  @ApiReadErrors()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<Partial<Connection>> {
    return await this.connectionService.findById(id, context);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update connection' })
  @ApiUpdateErrors()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateConnectionDto,
    @CurrentUser() context: RequestContext,
  ): Promise<Partial<Connection>> {
    return await this.connectionService.update(id, dto, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete connection' })
  @ApiDeleteErrors()
  async delete(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.connectionService.softDelete(id, context);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get connection logs', description: 'Retrieve lifecycle debug logs (max 200, auto-rotated)' })
  @ApiReadErrors()
  async getLogs(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<{ logs: ConnectionLog[] }> {
    const logs = await this.connectionService.getLogs(id, context);
    return { logs };
  }

  @Post(':id/routes')
  @ApiOperation({ summary: 'Add a route to connection' })
  @ApiCreateErrors()
  async addRoute(
    @Param('id') id: string,
    @Body() route: ConnectionRouteDto,
    @CurrentUser() context: RequestContext,
  ): Promise<Connection> {
    return this.connectionService.addRoute(id, route, context);
  }

  @Put(':id/routes/:routeIndex')
  @ApiOperation({ summary: 'Update a route in connection' })
  @ApiUpdateErrors()
  async updateRoute(
    @Param('id') id: string,
    @Param('routeIndex') routeIndex: number,
    @Body() route: ConnectionRouteDto,
    @CurrentUser() context: RequestContext,
  ): Promise<Connection> {
    return this.connectionService.updateRoute(id, Number(routeIndex), route, context);
  }

  @Delete(':id/routes/:routeIndex')
  @ApiOperation({ summary: 'Remove a route from connection' })
  @ApiDeleteErrors()
  async removeRoute(
    @Param('id') id: string,
    @Param('routeIndex') routeIndex: number,
    @CurrentUser() context: RequestContext,
  ) {
    return this.connectionService.removeRoute(id, Number(routeIndex), context);
  }

  // ─── Zalo OA OAuth ───────────────────────────────────────────────────────────

  @Get(':id/oauth')
  @Redirect()
  @ApiOperation({ summary: 'Zalo OA: redirect admin to Zalo authorization page' })
  async zaloOaOauth(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<{ url: string }> {
    const connection = await this.connectionService.findByIdInternal(id);
    if (!connection) throw new NotFoundException(`Connection ${id} not found`);
    if ((connection as any).provider !== 'zalo-oa') {
      throw new BadRequestException('OAuth is only supported for zalo-oa connections');
    }
    const appId: string = (connection as any).config?.zaloAppId ?? '';
    if (!appId) throw new BadRequestException('zaloAppId is not configured');
    const url = await this.connectionService.buildZaloOaAuthUrl(id, appId);
    return { url };
  }

  @Get(':id/oauth-callback')
  @ApiOperation({ summary: 'Zalo OA: OAuth callback — exchange code for token' })
  async zaloOaOauthCallback(
    @Param('id') id: string,
    @Query('code') code: string,
    @Query('state') _state: string,
  ): Promise<{ message: string }> {
    if (!code) throw new BadRequestException('Missing code');
    await this.connectionService.exchangeZaloOaCode(id, code);
    await this.connectionService.registerZaloOaWebhook(id).catch((err: Error) => {
      // Non-fatal: token is saved, webhook can be retried manually
      console.warn(`Zalo OA webhook register failed after OAuth: ${err.message}`);
    });
    return { message: 'Zalo OA authorization successful. Connection is now active.' };
  }

}
