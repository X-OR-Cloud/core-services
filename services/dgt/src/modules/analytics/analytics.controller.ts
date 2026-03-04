import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Performance summary — PnL, win rate, volume by time range' })
  @ApiQuery({ name: 'range', required: false, enum: ['24h', '7d', '30d', '90d', 'all'], example: '7d' })
  @ApiQuery({ name: 'accountId', required: false })
  getSummary(
    @CurrentUser() ctx: RequestContext,
    @Query('range') range: '24h' | '7d' | '30d' | '90d' | 'all' = '7d',
    @Query('accountId') accountId?: string,
  ) {
    return this.analyticsService.getSummary(ctx.userId, range, accountId);
  }

  @Get('positions/open')
  @ApiOperation({ summary: 'List open positions' })
  @ApiQuery({ name: 'accountId', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  getOpenPositions(
    @CurrentUser() ctx: RequestContext,
    @Query('accountId') accountId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.analyticsService.getOpenPositions(ctx.userId, accountId, parseInt(page, 10), parseInt(limit, 10));
  }

  @Get('trades')
  @ApiOperation({ summary: 'Trade history (closed positions) by time range' })
  @ApiQuery({ name: 'range', required: false, enum: ['24h', '7d', '30d', '90d', 'all'], example: '30d' })
  @ApiQuery({ name: 'accountId', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  getTrades(
    @CurrentUser() ctx: RequestContext,
    @Query('range') range: '24h' | '7d' | '30d' | '90d' | 'all' = '30d',
    @Query('accountId') accountId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.analyticsService.getTrades(ctx.userId, range, accountId, parseInt(page, 10), parseInt(limit, 10));
  }

  @Get('pnl-chart')
  @ApiOperation({ summary: 'Daily PnL data points for chart (cumulative)' })
  @ApiQuery({ name: 'range', required: false, enum: ['24h', '7d', '30d', '90d', 'all'], example: '7d' })
  @ApiQuery({ name: 'accountId', required: false })
  getPnlChart(
    @CurrentUser() ctx: RequestContext,
    @Query('range') range: '24h' | '7d' | '30d' | '90d' | 'all' = '7d',
    @Query('accountId') accountId?: string,
  ) {
    return this.analyticsService.getPnlChart(ctx.userId, range, accountId);
  }
}
