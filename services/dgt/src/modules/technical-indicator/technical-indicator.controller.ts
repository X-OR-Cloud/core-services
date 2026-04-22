import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard, ApiReadErrors } from '@hydrabyte/base';
import { TechnicalIndicatorService } from './technical-indicator.service';
import { QueryTechnicalIndicatorDto } from './technical-indicator.dto';

@ApiTags('technical-indicators')
@ApiBearerAuth('JWT-auth')
@Controller('technical-indicators')
export class TechnicalIndicatorController {
  constructor(private readonly service: TechnicalIndicatorService) {}

  @Get()
  @ApiOperation({ summary: 'Query technical indicators' })
  @ApiResponse({ status: 200, description: 'Technical indicators retrieved' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async find(@Query() query: QueryTechnicalIndicatorDto) {
    const filter: Record<string, any> = { symbol: query.symbol };
    if (query.timeframe) filter.timeframe = query.timeframe;

    if (query.from || query.to) {
      return this.service.findByRange(
        filter,
        query.from ? new Date(query.from) : new Date(0),
        query.to ? new Date(query.to) : new Date(),
      );
    }

    return this.service.findAll(filter);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Get latest technical indicators' })
  @ApiResponse({ status: 200, description: 'Latest technical indicators' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findLatest(@Query() query: QueryTechnicalIndicatorDto) {
    const filter: Record<string, any> = { symbol: query.symbol };
    if (query.timeframe) filter.timeframe = query.timeframe;
    return this.service.findLatest(filter);
  }

  @Get('history')
  @ApiOperation({ summary: '[DEBUG] Historical series of all indicator values for a symbol/timeframe — for charting and analysis' })
  @ApiQuery({ name: 'symbol', required: true, example: 'PAXGUSDT' })
  @ApiQuery({ name: 'timeframe', required: false, example: '1h', enum: ['1m', '5m', '15m', '1h', '4h', '1d'] })
  @ApiQuery({ name: 'from', required: false, example: '2026-04-01T00:00:00Z' })
  @ApiQuery({ name: 'to', required: false, example: '2026-04-22T00:00:00Z' })
  @ApiQuery({ name: 'limit', required: false, example: 200 })
  @ApiQuery({ name: 'fields', required: false, example: 'rsi14,macdLine,macdSignal,ema20', description: 'Comma-separated list of indicator fields to include. Omit to get all fields.' })
  @UseGuards(JwtAuthGuard)
  async getHistory(
    @Query('symbol') symbol: string,
    @Query('timeframe') timeframe?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('fields') fields?: string,
  ) {
    const filter: Record<string, any> = { symbol };
    if (timeframe) filter.timeframe = timeframe;

    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 1000) : 200;
    const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const result = await this.service.findByRange(filter, fromDate, toDate, {
      sort: { timestamp: 1 },
      limit: parsedLimit,
    });

    if (!fields) return result;

    const fieldList = fields.split(',').map((f) => f.trim());
    const allowedFields = new Set([
      'rsi14', 'macdLine', 'macdSignal', 'macdHistogram',
      'ema9', 'ema20', 'ema50', 'ema200', 'sma20',
      'bbUpper', 'bbMiddle', 'bbLower',
      'atr14', 'atr14Pct', 'volumeRatio', 'hv30d',
    ]);
    const selectedFields = fieldList.filter((f) => allowedFields.has(f));

    const filtered = result.data.map((record: any) => {
      const base: Record<string, any> = {
        symbol: record.symbol,
        timeframe: record.timeframe,
        timestamp: record.timestamp,
      };
      for (const f of selectedFields) {
        base[f] = record[f] ?? null;
      }
      return base;
    });

    return { data: filtered, total: result.total };
  }
}
