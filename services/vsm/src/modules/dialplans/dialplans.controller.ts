import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { DialplansService } from './dialplans.service';
import { CreateDialplanDto, UpdateDialplanDto } from './dialplans.dto';

@ApiTags('dialplans')
@ApiBearerAuth()
@Controller('dialplans')
export class DialplansController {
  constructor(private readonly service: DialplansService) {}

  @Post()
  @ApiOperation({ summary: 'Create dialplan' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateDialplanDto, @CurrentUser() ctx: RequestContext) {
    return this.service.create(dto, ctx);
  }

  @Get()
  @ApiOperation({ summary: 'List dialplans' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  findAll(@Query() query: QueryStringParams, @CurrentUser() ctx: RequestContext) {
    return this.service.findAll(parseQueryString(query), ctx);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get dialplan by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @CurrentUser() ctx: RequestContext) {
    return this.service.findById(id as any, ctx);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update dialplan' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() dto: UpdateDialplanDto, @CurrentUser() ctx: RequestContext) {
    return this.service.update(id, dto, ctx);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete dialplan (soft delete)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUser() ctx: RequestContext) {
    return this.service.softDelete(id, ctx);
  }
}
