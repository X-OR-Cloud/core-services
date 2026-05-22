import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { SetMetadata } from '@nestjs/common';
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
import { InvoiceService } from './invoice.service';
import { CreateInvoiceDto, UpdateInvoiceDto, LinkEInvoiceDto } from './invoice.dto';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new invoice (status forced: draft)' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createInvoiceDto: CreateInvoiceDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.invoiceService.create(createInvoiceDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List invoices with pagination, search and statistics' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext
  ) {
    const { search, ...rest } = query;
    const options = parseQueryString(rest);
    return this.invoiceService.findAll({ ...options, search }, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.invoiceService.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update invoice by ID (only allowed in draft status)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.invoiceService.update(new Types.ObjectId(id) as any, updateInvoiceDto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete invoice (only draft or cancelled)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.invoiceService.softDelete(new Types.ObjectId(id) as any, context);
  }

  // =============== Phase 3: State machine ===============

  @Post(':id/send')
  @ApiOperation({ summary: 'Send invoice to customer', description: 'Transition: draft → sent' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async send(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.invoiceService.send(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/mark-overdue')
  @ApiOperation({ summary: 'Mark invoice as overdue', description: 'Transition: sent/partial → overdue' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async markOverdue(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.invoiceService.markOverdue(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel invoice', description: 'Transition: any unpaid → cancelled' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async cancel(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.invoiceService.cancel(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/reopen')
  @ApiOperation({ summary: 'Reopen cancelled invoice', description: 'Transition: cancelled → draft' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async reopen(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.invoiceService.reopen(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id/e-invoice')
  @ApiOperation({ summary: 'Link e-invoice data (VNPT, MISA, Viettel...)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async linkEInvoice(
    @Param('id') id: string,
    @Body() dto: LinkEInvoiceDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.invoiceService.linkEInvoice(new Types.ObjectId(id) as any, dto as any, context);
  }

  // =============== Booking: Share link & Public view ===============

  @Post(':id/share-link')
  @ApiOperation({
    summary: 'Generate public share link (72h TTL)',
    description: 'Generate a public URL to share the invoice without authentication. Can be called anytime to regenerate/extend the link.',
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async generateShareLink(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.invoiceService.generateShareLink(new Types.ObjectId(id) as any, context);
  }

  @Get('public/:token')
  @SetMetadata('public', true)
  @ApiOperation({
    summary: 'View invoice by public share token (no auth required)',
    description: 'Returns invoice data with customer.phone hidden. Valid until TTL expires (72h from generation). Invoice status does not affect link validity.',
  })
  @ApiReadErrors()
  @ApiParam({ name: 'token', description: 'Share token from POST /invoices/:id/share-link' })
  async getPublicInvoice(@Param('token') token: string) {
    return this.invoiceService.getPublicInvoice(token);
  }
}
