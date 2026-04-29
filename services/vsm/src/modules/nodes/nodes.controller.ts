import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { AmiAuthGuard } from '../../common/ami-auth.guard';
import { NodesService } from './nodes.service';
import { CreateNodeDto, UpdateNodeDto } from './nodes.dto';

@ApiTags('nodes')
@ApiBearerAuth()
@Controller('nodes')
export class NodesController {
  constructor(private readonly service: NodesService) {}

  @Post()
  @ApiOperation({ summary: 'Create Asterisk node' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateNodeDto, @CurrentUser() ctx: RequestContext) {
    return this.service.create(dto, ctx);
  }

  @Get()
  @ApiOperation({ summary: 'List nodes' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  findAll(@Query() query: QueryStringParams, @CurrentUser() ctx: RequestContext) {
    return this.service.findAll(parseQueryString(query), ctx);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get node by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @CurrentUser() ctx: RequestContext) {
    return this.service.findById(id as any, ctx);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get node AMI connection status' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async getStatus(@Param('id') id: string, @CurrentUser() ctx: RequestContext) {
    const node = await this.service.findById(id as any, ctx);
    return { status: node.status };
  }

  @Get(':id/credentials')
  @ApiOperation({ summary: '[Internal] Get decrypted AMI credentials — AMI bridge only' })
  @UseGuards(AmiAuthGuard)
  getCredentials(@Param('id') id: string) {
    return this.service.getCredentials(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '[Internal] Update node AMI connection status — AMI bridge only' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AmiAuthGuard)
  updateStatus(@Param('id') id: string, @Body() body: { status: 'online' | 'offline' | 'error' }) {
    return this.service.updateStatus(id, body.status);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update node' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() dto: UpdateNodeDto, @CurrentUser() ctx: RequestContext) {
    return this.service.update(id, dto, ctx);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete node (soft delete)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUser() ctx: RequestContext) {
    return this.service.softDelete(id, ctx);
  }
}
