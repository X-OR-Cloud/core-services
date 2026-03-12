import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Types } from 'mongoose';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { ConnectionService } from './connection.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { ConnectionRouteDto } from './dto/create-connection.dto';
import { Connection } from './connection.schema';

@ApiTags('Connections')
@Controller('connections')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConnectionController {
  constructor(private readonly connectionService: ConnectionService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new connection' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Connection created', type: Connection })
  @ApiCreateErrors()
  async create(
    @Body() dto: CreateConnectionDto,
    @CurrentUser() context: RequestContext,
  ): Promise<Connection> {
    return this.connectionService.createConnection(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List connections for current org' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Connections retrieved', type: [Connection] })
  @ApiReadErrors({ notFound: false })
  async findAll(@CurrentUser() context: RequestContext): Promise<Connection[]> {
    return this.connectionService.getOrgConnections(context.orgId, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get connection by ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Connection retrieved', type: Connection })
  @ApiReadErrors()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<Connection> {
    return this.connectionService.findById(new Types.ObjectId(id) as any, context);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update connection' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Connection updated', type: Connection })
  @ApiUpdateErrors()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateConnectionDto,
    @CurrentUser() context: RequestContext,
  ): Promise<Connection> {
    return this.connectionService.updateConnection(id, dto, context);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete connection' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Connection deleted' })
  @ApiDeleteErrors()
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ): Promise<void> {
    await this.connectionService.softDelete(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/routes')
  @ApiOperation({ summary: 'Add a route to connection' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Route added', type: Connection })
  @ApiCreateErrors()
  async addRoute(
    @Param('id') id: string,
    @Body() route: ConnectionRouteDto,
    @CurrentUser() context: RequestContext,
  ): Promise<Connection> {
    return this.connectionService.addRoute(id, route, context);
  }

  @Delete(':id/routes/:routeIndex')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a route from connection' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Route removed' })
  @ApiDeleteErrors()
  async removeRoute(
    @Param('id') id: string,
    @Param('routeIndex') routeIndex: number,
    @CurrentUser() context: RequestContext,
  ): Promise<void> {
    await this.connectionService.removeRoute(id, Number(routeIndex), context);
  }
}
