import { Controller, Get, Post, Body, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, ApiCreateErrors, ApiReadErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { TradeService } from './trade.service';
import { TradeExecutionService } from './trade-execution.service';
import { CreateTradeDto, ExecuteFromSignalDto } from './trade.dto';

@ApiTags('trades')
@ApiBearerAuth('JWT-auth')
@Controller('trades')
export class TradeController {
  constructor(
    private readonly tradeService: TradeService,
    private readonly tradeExecutionService: TradeExecutionService,
  ) {}

  @Post('from-signal')
  @ApiOperation({ summary: 'Execute trade from signal (FRS-02)' })
  @ApiResponse({ status: 201, description: 'Trade executed successfully from signal' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async executeFromSignal(
    @Body() dto: ExecuteFromSignalDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.tradeExecutionService.executeFromSignal(context.userId, dto, context);
  }

  @Post()
  @ApiOperation({ summary: 'Create trade' })
  @ApiResponse({ status: 201, description: 'Trade created successfully' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() dto: CreateTradeDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.tradeService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all trades' })
  @ApiResponse({ status: 200, description: 'Trades retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext,
  ) {
    const options = parseQueryString(query);
    return this.tradeService.findAll(options, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get trade by ID' })
  @ApiResponse({ status: 200, description: 'Trade found' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const trade = await this.tradeService.findById(new Types.ObjectId(id) as any, context);
    if (!trade) throw new NotFoundException(`Trade ${id} not found`);
    return trade;
  }
}
