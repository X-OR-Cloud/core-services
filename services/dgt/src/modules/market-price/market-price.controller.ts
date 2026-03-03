import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, ApiReadErrors } from '@hydrabyte/base';
import { MarketPriceService } from './market-price.service';
import { QueryMarketPriceDto } from './market-price.dto';

@ApiTags('market-prices')
@ApiBearerAuth('JWT-auth')
@Controller('market-prices')
export class MarketPriceController {
  constructor(private readonly marketPriceService: MarketPriceService) {}

  @Get()
  @ApiOperation({ summary: 'Query market prices' })
  @ApiResponse({ status: 200, description: 'Market prices retrieved' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async find(@Query() query: QueryMarketPriceDto) {
    const filter: Record<string, any> = { symbol: query.symbol };
    if (query.source) filter.source = query.source;
    if (query.timeframe) filter.timeframe = query.timeframe;

    if (query.from || query.to) {
      return this.marketPriceService.findByRange(
        filter,
        query.from ? new Date(query.from) : new Date(0),
        query.to ? new Date(query.to) : new Date(),
      );
    }

    return this.marketPriceService.findAll(filter);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Get latest market price for a symbol' })
  @ApiResponse({ status: 200, description: 'Latest market price' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findLatest(@Query() query: QueryMarketPriceDto) {
    const filter: Record<string, any> = { symbol: query.symbol };
    if (query.source) filter.source = query.source;
    if (query.timeframe) filter.timeframe = query.timeframe;

    return this.marketPriceService.findLatest(filter);
  }
}
