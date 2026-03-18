import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Portfolio summary — total value, PnL, asset allocation' })
  getSummary(@CurrentUser() ctx: RequestContext) {
    return this.dashboardService.getSummary(ctx.userId);
  }

  @Get('price-cards')
  @ApiOperation({ summary: 'Price cards with sparkline for dashboard' })
  @ApiQuery({ name: 'symbols', required: false, example: 'PAXGUSDT,XAUTUSD,XAUUSD' })
  @ApiQuery({ name: 'sparklinePoints', required: false, example: 7 })
  getPriceCards(
    @Query('symbols') symbols = 'PAXGUSDT,XAUTUSD,XAUUSD',
    @Query('sparklinePoints') sparklinePoints = '7',
  ) {
    const symbolList = symbols.split(',').map((s) => s.trim()).filter(Boolean);
    return this.dashboardService.getPriceCards(symbolList, parseInt(sparklinePoints, 10) || 7);
  }

  @Get('portfolio-history')
  @ApiOperation({ summary: 'Portfolio value history for chart' })
  @ApiQuery({ name: 'range', required: false, enum: ['7d', '30d', '90d', 'all'], example: '30d' })
  getPortfolioHistory(
    @CurrentUser() ctx: RequestContext,
    @Query('range') range: '7d' | '30d' | '90d' | 'all' = '30d',
  ) {
    return this.dashboardService.getPortfolioHistory(ctx.userId, range);
  }

  @Get('ai-signal')
  @ApiOperation({ summary: 'AI Trend Signal widget — BULLISH/BEARISH/NEUTRAL with confidence' })
  @ApiQuery({ name: 'timeframe', required: false, enum: ['1h', '4h', '12h', '24h'], example: '4h' })
  @ApiQuery({ name: 'symbol', required: false, example: 'PAXGUSDT' })
  getAiSignal(
    @CurrentUser() ctx: RequestContext,
    @Query('timeframe') timeframe = '4h',
    @Query('symbol') symbol = 'PAXGUSDT',
  ) {
    return this.dashboardService.getAiSignal(ctx.userId, symbol, timeframe);
  }

  @Get('ai-prediction')
  @ApiOperation({ summary: 'AI Prediction widget — alias for ai-signal' })
  @ApiQuery({ name: 'timeframe', required: false, enum: ['1h', '4h', '12h', '24h'], example: '4h' })
  @ApiQuery({ name: 'symbol', required: false, example: 'PAXGUSDT' })
  getAiPrediction(
    @CurrentUser() ctx: RequestContext,
    @Query('timeframe') timeframe = '4h',
    @Query('symbol') symbol = 'PAXGUSDT',
  ) {
    return this.dashboardService.getAiSignal(ctx.userId, symbol, timeframe);
  }

  @Get('market-status')
  @ApiOperation({ summary: 'Market Status widget — trend, volatility, liquidity' })
  @ApiQuery({ name: 'symbol', required: false, example: 'PAXGUSDT' })
  getMarketStatus(@Query('symbol') symbol = 'PAXGUSDT') {
    return this.dashboardService.getMarketStatus(symbol);
  }

  @Get('macro-context')
  @ApiOperation({ summary: 'Macro Context widget — DXY, VIX, Real Yield, Trade Gate' })
  getMacroContext() {
    return this.dashboardService.getMacroContext();
  }

  @Get('market-indicators')
  @ApiOperation({ summary: 'Market Indicators widget — RSI, Fear & Greed, Support/Resistance' })
  @ApiQuery({ name: 'symbol', required: false, example: 'PAXGUSDT' })
  getMarketIndicators(@Query('symbol') symbol = 'PAXGUSDT') {
    return this.dashboardService.getMarketIndicators(symbol);
  }

  @Get('ai-activity')
  @ApiOperation({ summary: 'AI Activity Feed — recent bot activity logs (poll every 30s)' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'since', required: false, description: 'ISO 8601 timestamp for incremental updates' })
  getAiActivity(
    @CurrentUser() ctx: RequestContext,
    @Query('limit') limit = '20',
    @Query('since') since?: string,
  ) {
    return this.dashboardService.getAiActivity(ctx.userId, parseInt(limit, 10) || 20, since);
  }
}
