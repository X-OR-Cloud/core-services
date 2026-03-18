import { Controller, Get, Post, Body, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams, ApiCreateErrors, ApiReadErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { TradeService } from './trade.service';
import { TradeExecutionService } from './trade-execution.service';
import { CreateTradeDto, ExecuteFromSignalDto } from './trade.dto';

@ApiTags('trades')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('trades')
export class TradeController {
  constructor(
    private readonly tradeService: TradeService,
    private readonly tradeExecutionService: TradeExecutionService,
  ) {}

  @Post('from-signal')
  @ApiOperation({ summary: 'Execute trade from signal (FRS-02)' })
  @ApiCreateErrors()
  async executeFromSignal(
    @Body() dto: ExecuteFromSignalDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.tradeExecutionService.executeFromSignal(context.userId, dto, context);
  }

  @Post()
  @ApiOperation({ summary: 'Create trade' })
  @ApiCreateErrors()
  async create(
    @Body() dto: CreateTradeDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.tradeService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all trades' })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: QueryStringParams,
    @CurrentUser() context: RequestContext,
  ) {
    return this.tradeService.findAll(parseQueryString(query), context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get trade by ID' })
  @ApiReadErrors()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const trade = await this.tradeService.findById(id, context);
    if (!trade) throw new NotFoundException(`Trade ${id} not found`);
    return trade;
  }
}
