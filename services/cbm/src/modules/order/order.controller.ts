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
import { OrderService } from './order.service';
import { CreateOrderDto, UpdateOrderDto } from './order.dto';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrderController {
  constructor(private readonly service: OrderService) {}

  @Post()
  @ApiOperation({ summary: 'Create an order (status forced: new, code auto-generated)' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateOrderDto, @CurrentUser() context: RequestContext) {
    return this.service.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List orders with pagination, search and status statistics' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: Record<string, any>, @CurrentUser() context: RequestContext) {
    const { search, dateFrom, dateTo, ...rest } = query;
    return this.service.findAll({ ...parseQueryString(rest), search, dateFrom, dateTo }, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update order (only allowed in new or processing status)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.service.update(new Types.ObjectId(id) as any, dto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete order. Owner: any status. Editor: new/processing only → 403 ORDER_CANNOT_DELETE for done/cancelled' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.softDelete(new Types.ObjectId(id) as any, context);
  }

  // ── State machine ──────────────────────────────────────────────────────────

  @Post(':id/process')
  @ApiOperation({ summary: 'Start processing order', description: 'Transition: new → processing' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async process(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.process(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete order', description: 'Transition: new/processing → done' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async complete(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.complete(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel order', description: 'Transition: new/processing → cancelled' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async cancel(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.cancel(new Types.ObjectId(id) as any, context);
  }
}
