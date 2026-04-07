import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiReadErrors,
  parseQueryString,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { TransactionService } from './transaction.service';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get()
  @ApiOperation({ summary: 'List transactions (read-only, auto-generated from payments and expenses)' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext
  ) {
    const options = parseQueryString(query);
    return this.transactionService.findAll({ ...options }, context);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get aggregated income vs expense summary by period and currency' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async getSummary(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext
  ) {
    // Phase 3: implement aggregation logic in TransactionService
    return { message: 'Summary endpoint — to be implemented in Phase 3', query };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.transactionService.findById(new Types.ObjectId(id) as any, context);
  }

  // No POST / PATCH / DELETE — Transactions are auto-generated and read-only
}
