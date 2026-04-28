import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { TrunksService } from './trunks.service';
import { CreateTrunkDto, UpdateTrunkDto } from './trunks.dto';

@ApiTags('trunks')
@ApiBearerAuth()
@Controller('trunks')
export class TrunksController {
  constructor(private readonly service: TrunksService) {}

  @Post()
  @ApiOperation({ summary: 'Create SIP trunk' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateTrunkDto, @CurrentUser() ctx: RequestContext) {
    return this.service.create(dto, ctx);
  }

  @Get()
  @ApiOperation({ summary: 'List trunks' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  findAll(@Query() query: QueryStringParams, @CurrentUser() ctx: RequestContext) {
    return this.service.findAll(parseQueryString(query), ctx);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get trunk by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @CurrentUser() ctx: RequestContext) {
    return this.service.findById(id as any, ctx);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update trunk' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() dto: UpdateTrunkDto, @CurrentUser() ctx: RequestContext) {
    return this.service.update(id, dto, ctx);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete trunk (soft delete)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUser() ctx: RequestContext) {
    return this.service.softDelete(id, ctx);
  }
}
