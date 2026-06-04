import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
  parseQueryString,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { DomainConfigService } from './domain-config.service';
import { CreateDomainConfigDto, UpdateDomainConfigDto } from './domain-config.dto';

@ApiTags('Domain Config')
@ApiBearerAuth()
@Controller('domain-configs')
export class DomainConfigController {
  constructor(private readonly service: DomainConfigService) {}

  @Get('active')
  @ApiOperation({ summary: 'Get effective order config for current org (fallback to default preset)' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async getActive(@CurrentUser() context: RequestContext) {
    return this.service.getOrderConfig(context.orgId);
  }

  @Get()
  @ApiOperation({ summary: 'List domain configs (presets + org-specific)' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: Record<string, any>, @CurrentUser() context: RequestContext) {
    return this.service.findAll(parseQueryString(query), context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get domain config by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.findById(new Types.ObjectId(id) as any, context);
  }

  @Post()
  @ApiOperation({ summary: 'Create org-specific domain config' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateDomainConfigDto, @CurrentUser() context: RequestContext) {
    return this.service.createOrgConfig(dto, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update org-specific domain config' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDomainConfigDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.service.update(new Types.ObjectId(id) as any, dto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete org-specific domain config (cannot delete system presets)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.deleteOrgConfig(new Types.ObjectId(id) as any, context);
  }
}
