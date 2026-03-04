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
}
