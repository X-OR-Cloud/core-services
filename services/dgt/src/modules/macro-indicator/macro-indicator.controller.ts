import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, ApiReadErrors } from '@hydrabyte/base';
import { MacroIndicatorService } from './macro-indicator.service';
import { QueryMacroIndicatorDto } from './macro-indicator.dto';

@ApiTags('macro-indicators')
@ApiBearerAuth('JWT-auth')
@Controller('macro-indicators')
export class MacroIndicatorController {
  constructor(private readonly service: MacroIndicatorService) {}

  @Get()
  @ApiOperation({ summary: 'Query macro indicators' })
  @ApiResponse({ status: 200, description: 'Macro indicators retrieved' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async find(@Query() query: QueryMacroIndicatorDto) {
    const filter: Record<string, any> = {};
    if (query.seriesId) filter.seriesId = query.seriesId;

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
  @ApiOperation({ summary: 'Get latest macro indicator values' })
  @ApiResponse({ status: 200, description: 'Latest macro indicator' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findLatest(@Query('seriesId') seriesId: string) {
    return this.service.findLatest({ seriesId });
  }
}
