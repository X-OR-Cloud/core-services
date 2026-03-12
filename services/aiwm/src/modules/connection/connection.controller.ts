import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
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
import { Connection } from './connection.schema';

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
}
