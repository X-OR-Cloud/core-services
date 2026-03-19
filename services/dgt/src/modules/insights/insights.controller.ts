import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '@hydrabyte/base';
import { InsightsMacroService } from './insights-macro.service';
import { InsightsDataService } from './insights-data.service';

@ApiTags('insights')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('insights')
export class InsightsController {
  constructor(
    private readonly macroService: InsightsMacroService,
    private readonly dataService: InsightsDataService,
  ) {}

  // ── Macro endpoints ───────────────────────────────────────────────────────

  @Get('macro/risk-score')
  @ApiOperation({ summary: 'Macro risk score based on VIX — LOW / MEDIUM / HIGH' })
  getRiskScore() {
    return this.macroService.getRiskScore();
  }

  @Get('macro/trade-gate')
  @ApiOperation({ summary: 'Trade gate status — OPEN or BLOCKED based on macro risk' })
  getTradeGate() {
    return this.macroService.getTradeGate();
  }

  @Get('macro/feed')
  @ApiOperation({ summary: 'Macro feed — latest macro indicators + key economic events' })
  getMacroFeed() {
    return this.macroService.getFeed();
  }

  @Get('macro/calendar')
  @ApiOperation({ summary: 'Macro calendar — upcoming economic data release dates' })
  getMacroCalendar() {
    return this.macroService.getCalendar();
  }

  @Get('macro/monetary')
  @ApiOperation({ summary: 'Monetary policy — Fed Funds, real yield, yield curve' })
  getMonetary() {
    return this.macroService.getMonetary();
  }

  @Get('macro/liquidity')
  @ApiOperation({ summary: 'Gold liquidity — DXY, ETF flows, futures funding rate' })
  getLiquidity() {
    return this.macroService.getLiquidity();
  }

  // ── Data endpoints ────────────────────────────────────────────────────────

  @Get('data/technical-indicators')
  @ApiOperation({ summary: 'Full technical indicators snapshot for a symbol and timeframe' })
  @ApiQuery({ name: 'symbol', required: false, example: 'PAXGUSDT' })
  @ApiQuery({ name: 'timeframe', required: false, example: '1h' })
  getTechnicalIndicators(
    @Query('symbol') symbol = 'PAXGUSDT',
    @Query('timeframe') timeframe = '1h',
  ) {
    return this.dataService.getTechnicalIndicators(symbol, timeframe);
  }

  @Get('data/sentiment-volatility')
  @ApiOperation({ summary: 'Sentiment & volatility — news sentiment, ATR, funding rate' })
  @ApiQuery({ name: 'symbol', required: false, example: 'PAXGUSDT' })
  getSentimentVolatility(@Query('symbol') symbol = 'PAXGUSDT') {
    return this.dataService.getSentimentVolatility(symbol);
  }

  @Get('data/liquidity-heatmap')
  @ApiOperation({ summary: 'Liquidity heatmap — hourly volume distribution over 24h' })
  @ApiQuery({ name: 'symbol', required: false, example: 'PAXGUSDT' })
  getLiquidityHeatmap(@Query('symbol') symbol = 'PAXGUSDT') {
    return this.dataService.getLiquidityHeatmap(symbol);
  }

  @Get('data/advanced-metrics')
  @ApiOperation({ summary: 'Advanced metrics — RSI zones, MACD crossover, BB width, latest signal' })
  @ApiQuery({ name: 'symbol', required: false, example: 'PAXGUSDT' })
  @ApiQuery({ name: 'timeframe', required: false, example: '1h' })
  getAdvancedMetrics(
    @Query('symbol') symbol = 'PAXGUSDT',
    @Query('timeframe') timeframe = '1h',
  ) {
    return this.dataService.getAdvancedMetrics(symbol, timeframe);
  }
}
