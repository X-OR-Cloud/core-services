import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { OrderService } from './order.service';
import { CreateOrderDto, UpdateOrderDto } from './order.dto';

@ApiTags('orders')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @ApiOperation({ summary: 'Create order' })
  @ApiCreateErrors()
  async create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.orderService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all orders' })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: QueryStringParams,
    @CurrentUser() context: RequestContext,
  ) {
    return this.orderService.findAll(parseQueryString(query), context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiReadErrors()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const order = await this.orderService.findById(id, context);
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update order' })
  @ApiUpdateErrors()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.orderService.update(id, dto, context);
    if (!updated) throw new NotFoundException(`Order ${id} not found`);
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel order' })
  @ApiDeleteErrors()
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    await this.orderService.softDelete(id, context);
    return { message: 'Order cancelled successfully' };
  }
}
