import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard, ApiReadErrors } from '@hydrabyte/base';
import { NewsArticleService } from './news-article.service';

@ApiTags('news-articles')
@ApiBearerAuth('JWT-auth')
@Controller('news-articles')
@UseGuards(JwtAuthGuard)
export class NewsArticleController {
  constructor(private readonly service: NewsArticleService) {}

  @Get()
  @ApiOperation({ summary: 'Get news articles with LLM sentiment analysis' })
  @ApiResponse({ status: 200, description: 'Articles retrieved' })
  @ApiReadErrors({ notFound: false })
  @ApiQuery({ name: 'sentimentLabel', required: false, enum: ['bullish', 'bearish', 'neutral'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  async findAll(
    @Query('sentimentLabel') sentimentLabel?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    const filter: Record<string, any> = {};
    if (sentimentLabel) filter.sentimentLabel = sentimentLabel;

    return this.service.findAll(filter, {
      sort: { publishedAt: -1 },
      limit: limit ? parseInt(limit) : 20,
      page: page ? parseInt(page) : 1,
    });
  }
}
