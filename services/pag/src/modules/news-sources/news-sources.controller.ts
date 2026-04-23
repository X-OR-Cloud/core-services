import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '@hydrabyte/base';
import { NewsSourcesService } from './news-sources.service';

@ApiTags('news-sources')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('news-sources')
export class NewsSourcesController {
  constructor(private readonly service: NewsSourcesService) {}

  @Get()
  @ApiOperation({ summary: 'List all news sources' })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  async findAll(@Query('active') active?: string) {
    const activeFilter = active === undefined ? undefined : active === 'true';
    return this.service.findAll(activeFilter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a news source by ID' })
  async findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a news source' })
  async create(@Body() body: Record<string, any>) {
    return this.service.create(body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a news source' })
  async update(@Param('id') id: string, @Body() body: Record<string, any>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a news source' })
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { success: true };
  }
}
