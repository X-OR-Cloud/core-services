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
    description: 'Returns totalRevenue, totalOrders and breakdown by item name for done orders in the given date range. Only accessible by organization.owner.',
  })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async getStats(@Query() query: OrderStatsQueryDto, @CurrentUser() context: RequestContext) {
    return this.service.getStats(query, context);
  }

  @Get('availability')
  @ApiOperation({
    summary: 'Check room/product availability for a date range',
    description: 'Returns available and booked productIds. Blocks both room and maintenance bookingTypes.',
  })
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
  @ApiOperation({
    summary: 'Get booking calendar for a month',
    description: 'Returns all bookings overlapping with the given month. FE groups by khu.',
  })
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

  // ── Booking state machine ──────────────────────────────────────────────────

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirm booking', description: 'Booking transition: new → processing' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async confirm(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.confirm(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/deposit')
  @ApiOperation({ summary: 'Mark booking as deposited', description: 'Booking transition: processing → deposited' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async deposit(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.deposit(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/checkin')
  @ApiOperation({ summary: 'Check in guest', description: 'Booking transition: deposited → checked_in' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async checkin(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.checkin(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/checkout')
  @ApiOperation({ summary: 'Check out guest', description: 'Booking transition: checked_in → done' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async checkout(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.service.checkout(new Types.ObjectId(id) as any, context);
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
