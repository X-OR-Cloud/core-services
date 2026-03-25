import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
  parseQueryString,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { KnowledgeCollectionService } from './knowledge-collection.service';
import {
  CreateKnowledgeCollectionDto,
  UpdateKnowledgeCollectionDto,
  SearchKnowledgeCollectionDto,
} from './knowledge-collection.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QdrantService } from '../knowledge-shared/qdrant.service';
import { EmbeddingService } from '../knowledge-shared/embedding.service';
import { KnowledgeFile } from '../knowledge-file/knowledge-file.schema';

@ApiTags('Knowledge Collections')
@ApiBearerAuth()
@Controller('knowledge-collections')
export class KnowledgeCollectionController {
  constructor(
    private readonly collectionService: KnowledgeCollectionService,
    private readonly qdrantService: QdrantService,
    private readonly embeddingService: EmbeddingService,
    @InjectModel(KnowledgeFile.name) private readonly fileModel: Model<KnowledgeFile>,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new knowledge collection' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createDto: CreateKnowledgeCollectionDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.collectionService.create(createDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List knowledge collections (org-scoped, excludes qdrantCollection & embeddingModel)' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext,
  ) {
    const options = parseQueryString(query);
    return this.collectionService.findAll(options, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get knowledge collection by ID (full details)' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.collectionService.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update knowledge collection name/description/chunkingConfig' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateKnowledgeCollectionDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.collectionService.update(new Types.ObjectId(id) as any, updateDto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete knowledge collection' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.collectionService.softDelete(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/reindex-all')
  @ApiOperation({ summary: 'Reset all files in collection to pending — triggers full re-embedding' })
  @UseGuards(JwtAuthGuard)
  async reindexAll(
    @Param('id') id: string,
  ) {
    const result = await this.fileModel.updateMany(
      { collectionId: id, isDeleted: false },
      { $set: { embeddingStatus: 'pending', errorMessage: undefined, chunkCount: 0 } },
    );
    return { queued: result.modifiedCount };
  }

  @Post(':id/search')
  @ApiOperation({ summary: 'Vector search within collection (RAG query)' })
  @UseGuards(JwtAuthGuard)
  async search(
    @Param('id') id: string,
    @Body() searchDto: SearchKnowledgeCollectionDto,
    @CurrentUser() context: RequestContext,
  ) {
    const collection = await this.collectionService.findByIdInternal(id);
    if (!collection) {
      return { results: [] };
    }

    // 1. Embed the query
    const queryVector = await this.embeddingService.embedText(searchDto.query);

    // 2. Search in Qdrant
    const results = await this.qdrantService.search(
      collection.qdrantCollection!,
      queryVector,
      {
        filter: {
          must: [
            { key: 'collectionId', match: { value: id } },
            { key: 'orgId', match: { value: context.orgId } },
          ],
        },
        topK: searchDto.topK || 5,
      },
    );

    return { results };
  }
}
