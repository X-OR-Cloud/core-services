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
import { InvoiceService } from './invoice.service';
import { CreateInvoiceDto, UpdateInvoiceDto } from './invoice.dto';

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

  // =============== Phase 3: State machine action endpoints ===============
  // POST /invoices/:id/send          → draft → sent
  // POST /invoices/:id/mark-overdue  → sent/partial → overdue
  // POST /invoices/:id/cancel        → * → cancelled
  // POST /invoices/:id/reopen        → cancelled → draft
  // PATCH /invoices/:id/e-invoice    → link e-invoice data
}
