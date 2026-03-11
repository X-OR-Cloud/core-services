import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, ApiReadErrors, parseQueryString } from '@hydrabyte/base';
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
  async findAll(@Query() query: Record<string, any>) {
    const options = parseQueryString(query);
    if (!options.sort || Object.keys(options.sort).length === 0) {
      options.sort = { publishedAt: -1 };
    }
    return this.service.findByOptions(options);
  }
}
