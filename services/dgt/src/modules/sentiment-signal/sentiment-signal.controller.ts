import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, ApiReadErrors } from '@hydrabyte/base';
import { SentimentSignalService } from './sentiment-signal.service';
import { QuerySentimentSignalDto } from './sentiment-signal.dto';

@ApiTags('sentiment-signals')
@ApiBearerAuth('JWT-auth')
@Controller('sentiment-signals')
export class SentimentSignalController {
  constructor(private readonly service: SentimentSignalService) {}

  @Get()
  @ApiOperation({ summary: 'Query sentiment signals' })
  @ApiResponse({ status: 200, description: 'Sentiment signals retrieved' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async find(@Query() query: QuerySentimentSignalDto) {
    const filter: Record<string, any> = {};
    if (query.source) filter.source = query.source;

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
  @ApiOperation({ summary: 'Get latest sentiment signal' })
  @ApiResponse({ status: 200, description: 'Latest sentiment signal' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findLatest(@Query('source') source?: string) {
    const filter: Record<string, any> = {};
    if (source) filter.source = source;
    return this.service.findLatest(filter);
  }
}
