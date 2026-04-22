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
import { ContractAnnexService } from './contract-annex.service';
import {
  CreateContractAnnexDto,
  UpdateContractAnnexDto,
  LinkAnnexEInvoiceDto,
} from './contract-annex.dto';

@ApiTags('Contract Annexes')
@ApiBearerAuth()
@Controller('contract-annexes')
export class ContractAnnexController {
  constructor(private readonly annexService: ContractAnnexService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new contract annex (status forced: draft, code auto-generated: PL01, PL02, ...)' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() dto: CreateContractAnnexDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.annexService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List annexes with pagination, search and statistics. Filter by contractId to scope to a contract.' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext
  ) {
    const { search, ...rest } = query;
    const options = parseQueryString(rest);
    return this.annexService.findAll({ ...options, search }, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get contract annex by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.annexService.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update contract annex (only allowed in draft status)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateContractAnnexDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.annexService.update(new Types.ObjectId(id) as any, dto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete annex (only allowed in draft or cancelled status)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.annexService.softDelete(new Types.ObjectId(id) as any, context);
  }

  // ========== State transitions ==========

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate annex (draft → active)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async activate(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.annexService.activate(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel annex (draft/active → cancelled)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async cancel(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.annexService.cancel(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id/reopen')
  @ApiOperation({ summary: 'Reopen cancelled annex (cancelled → draft)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async reopen(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.annexService.reopen(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id/e-invoice')
  @ApiOperation({ summary: 'Link e-invoice data to contract annex' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async linkEInvoice(
    @Param('id') id: string,
    @Body() dto: LinkAnnexEInvoiceDto,
    @CurrentUser() context: RequestContext
  ) {
    const { eInvoiceRawData, ...eInvoiceData } = dto;
    return this.annexService.linkEInvoice(
      new Types.ObjectId(id) as any,
      eInvoiceData,
      eInvoiceRawData,
      context
    );
  }
}
