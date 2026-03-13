import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, ApiReadErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { KnowledgeChunkService } from './knowledge-chunk.service';

@ApiTags('Knowledge Chunks')
@ApiBearerAuth()
@Controller('knowledge-chunks')
export class KnowledgeChunkController {
  constructor(private readonly chunkService: KnowledgeChunkService) {}

  @Get()
  @ApiOperation({ summary: 'List chunks (excludes content field). Filter by collectionId or sourceId.' })
  @ApiQuery({ name: 'collectionId', required: false })
  @ApiQuery({ name: 'sourceId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query('collectionId') collectionId: string,
    @Query('sourceId') sourceId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @CurrentUser() context: RequestContext,
  ) {
    return this.chunkService.findAll(
      { collectionId, sourceId, orgId: context.orgId },
      Number(page),
      Number(limit),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get chunk by ID (includes content)' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    return this.chunkService.findById(id);
  }
}
