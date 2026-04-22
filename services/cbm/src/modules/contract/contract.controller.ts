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
import { ContractService } from './contract.service';
import {
  CreateContractDto,
  UpdateContractDto,
  ContractStatusDto,
  LinkContractEInvoiceDto,
} from './contract.dto';

@ApiTags('Contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new contract (status forced: draft)' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() dto: CreateContractDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.contractService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List contracts with pagination, search and statistics' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext
  ) {
    const { search, ...rest } = query;
    const options = parseQueryString(rest);
    return this.contractService.findAll({ ...options, search }, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get contract by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.contractService.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update contract by ID (only allowed in draft status)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.contractService.update(new Types.ObjectId(id) as any, dto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete contract (only allowed in draft or cancelled status)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.contractService.softDelete(new Types.ObjectId(id) as any, context);
  }

  // ========== State transitions ==========

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate contract (draft → active)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async activate(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.contractService.activate(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id/expire')
  @ApiOperation({ summary: 'Mark contract as expired (active → expired)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async expire(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.contractService.expire(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id/terminate')
  @ApiOperation({ summary: 'Terminate contract (active → terminated)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async terminate(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.contractService.terminate(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel contract (draft/active → cancelled)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async cancel(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.contractService.cancel(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id/reopen')
  @ApiOperation({ summary: 'Reopen cancelled contract (cancelled → draft)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async reopen(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.contractService.reopen(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id/e-invoice')
  @ApiOperation({ summary: 'Link e-invoice data to contract' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async linkEInvoice(
    @Param('id') id: string,
    @Body() dto: LinkContractEInvoiceDto,
    @CurrentUser() context: RequestContext
  ) {
    const { eInvoiceRawData, ...eInvoiceData } = dto;
    return this.contractService.linkEInvoice(
      new Types.ObjectId(id) as any,
      eInvoiceData,
      eInvoiceRawData,
      context
    );
  }
}
