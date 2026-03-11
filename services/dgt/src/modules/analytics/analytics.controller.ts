import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { AnalyticsExportService } from './analytics-export.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly analyticsExportService: AnalyticsExportService,
  ) {}

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

  @Get('equity-curve')
  @ApiOperation({ summary: 'Equity curve over time from portfolio snapshots' })
  @ApiQuery({ name: 'range', required: false, enum: ['24h', '7d', '30d', '90d', 'all'], example: '30d' })
  @ApiQuery({ name: 'accountId', required: false })
  getEquityCurve(
    @CurrentUser() ctx: RequestContext,
    @Query('range') range: '24h' | '7d' | '30d' | '90d' | 'all' = '30d',
    @Query('accountId') accountId?: string,
  ) {
    return this.analyticsService.getEquityCurve(ctx.userId, range, accountId);
  }

  @Get('drawdown')
  @ApiOperation({ summary: 'Drawdown curve and max drawdown from portfolio snapshots' })
  @ApiQuery({ name: 'range', required: false, enum: ['24h', '7d', '30d', '90d', 'all'], example: '30d' })
  @ApiQuery({ name: 'accountId', required: false })
  getDrawdown(
    @CurrentUser() ctx: RequestContext,
    @Query('range') range: '24h' | '7d' | '30d' | '90d' | 'all' = '30d',
    @Query('accountId') accountId?: string,
  ) {
    return this.analyticsService.getDrawdown(ctx.userId, range, accountId);
  }

  @Get('export/csv')
  @ApiOperation({ summary: 'Export trade history as CSV file download' })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  @ApiQuery({ name: 'range', required: false, enum: ['24h', '7d', '30d', '90d', 'all'], example: '30d' })
  @ApiQuery({ name: 'accountId', required: false })
  async exportCsv(
    @CurrentUser() ctx: RequestContext,
    @Query('range') range: '24h' | '7d' | '30d' | '90d' | 'all' = '30d',
    @Query('accountId') accountId: string | undefined,
    @Res() res: Response,
  ) {
    const date = new Date().toISOString().slice(0, 10);
    const csvString = await this.analyticsExportService.exportTradesToCsv(ctx.userId, accountId, range);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="trades-${range}-${date}.csv"`);
    res.send(csvString);
  }
}
