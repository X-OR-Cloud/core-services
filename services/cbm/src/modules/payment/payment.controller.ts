import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  ServiceAccountPermissionGuard,
  RequirePermission,
  CurrentUser,
  ApiCreateErrors,
  ApiReadErrors,
  ApiDeleteErrors,
  parseQueryString,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './payment.dto';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @ApiOperation({ summary: 'Record a new payment against an invoice' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard, ServiceAccountPermissionGuard)
  @RequirePermission('cbm', 'payment', 'create')
  async create(
    @Body() createPaymentDto: CreatePaymentDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.paymentService.create(createPaymentDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List payments (filter by invoiceId, date, method, status)' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard, ServiceAccountPermissionGuard)
  @RequirePermission('cbm', 'payment', 'findAll')
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext
  ) {
    const options = parseQueryString(query);
    return this.paymentService.findAll({ ...options }, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard, ServiceAccountPermissionGuard)
  @RequirePermission('cbm', 'payment', 'findOne')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.paymentService.findById(new Types.ObjectId(id) as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Void payment (soft delete — reverses invoice status)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.paymentService.softDelete(new Types.ObjectId(id) as any, context);
  }

  // No PATCH — payments are immutable after creation
}
