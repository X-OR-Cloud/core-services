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
import { CreateOrderDto, UpdateOrderDto, OrderStatsQueryDto, AvailabilityQueryDto, CalendarQueryDto } from './order.dto';

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

  @Get('stats')
  @ApiOperation({
    summary: 'Get revenue stats (owner only)',
    description: 'Returns totalRevenue, totalOrders and breakdown by item name for done orders in the given date range.',
  })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async getStats(@Query() query: OrderStatsQueryDto, @CurrentUser() context: RequestContext) {
    return this.service.getStats(query, context);
  }

  @Get('availability')
  @ApiOperation({ summary: 'Check room/product availability for a date range' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async checkAvailability(@Query() query: AvailabilityQueryDto, @CurrentUser() context: RequestContext) {
    const productIds = Array.isArray(query.productIds) ? query.productIds : [query.productIds];
    return this.service.checkAvailability(
      productIds,
      new Date(query.checkIn),
      new Date(query.checkOut),
      context,
    );
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Get booking calendar for a month' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async getCalendar(@Query() query: CalendarQueryDto, @CurrentUser() context: RequestContext) {
    return this.service.getCalendar(query.month, query.bookingType, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update order data (only allowed in editable statuses: new, processing, deposited, active)' })
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
  @ApiOperation({ summary: 'Soft delete order. Owner: any status. Editor: new/processing only.' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.softDelete(new Types.ObjectId(id) as any, context);
  }

  // ── Generic actions (config-driven) ────────────────────────────────────────

  @Post(':id/start')
  @ApiOperation({ summary: 'Start processing order. Transition: new → processing' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async start(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.executeAction('start', new Types.ObjectId(id) as any, context);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirm order / take deposit. Transition: new|processing → deposited' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async confirm(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.executeAction('confirm', new Types.ObjectId(id) as any, context);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate order (service in use / check-in). Transition: new|processing|deposited → active' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async activate(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.executeAction('activate', new Types.ObjectId(id) as any, context);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete order. Transition: new|processing|deposited|active → done' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async complete(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.executeAction('complete', new Types.ObjectId(id) as any, context);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel order. Transition: new|processing|deposited|active → cancelled' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async cancel(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.executeAction('cancel', new Types.ObjectId(id) as any, context);
  }

  // ── Deprecated aliases ─────────────────────────────────────────────────────

  @Post(':id/process')
  @ApiOperation({ deprecated: true, summary: '[Deprecated] Use POST /:id/start' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async process(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.executeAction('start', new Types.ObjectId(id) as any, context);
  }
}
