import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
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
}
