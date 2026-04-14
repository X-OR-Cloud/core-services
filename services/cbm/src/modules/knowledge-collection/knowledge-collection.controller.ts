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
import { FileEntity } from '../file/file.schema';
import { FileService } from '../file/file.service';
import { KnowledgeChunkService } from '../knowledge-chunk/knowledge-chunk.service';

@ApiTags('Knowledge Collections')
@ApiBearerAuth()
@Controller('knowledge-collections')
export class KnowledgeCollectionController {
  constructor(
    private readonly collectionService: KnowledgeCollectionService,
    private readonly qdrantService: QdrantService,
    private readonly embeddingService: EmbeddingService,
    private readonly chunkService: KnowledgeChunkService,
    private readonly fileService: FileService,
    @InjectModel(FileEntity.name) private readonly fileModel: Model<FileEntity>,
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

  @Delete(':id/data')
  @ApiOperation({ summary: 'Clear all data inside a collection (files, chunks in MongoDB + Qdrant points) — keeps the collection record intact' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async clearData(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const collection = await this.collectionService.findByIdInternal(id);
    if (!collection) {
      return { deleted: { files: 0, chunks: 0, qdrantPoints: true } };
    }

    // 1. Delete all Qdrant points for this collection
    if (collection.qdrantCollection) {
      await this.qdrantService.deletePointsByFilter(collection.qdrantCollection, {
        must: [{ key: 'collectionId', match: { value: id } }],
      });
    }

    // 2. Hard delete all chunks in MongoDB
    await this.chunkService.deleteAllByCollectionId(id);

    // 3. Hard delete all knowledge files belonging to this collection
    const fileResult = await this.fileModel.deleteMany({
      purpose: 'knowledge',
      'ownerRef.kind': 'knowledge-collection',
      'ownerRef.id': id,
    });

    // 4. Reset collection stats
    await this.collectionService.updateStats(id, context);

    return {
      deleted: {
        files: fileResult.deletedCount,
        qdrantPoints: true,
      },
    };
  }

  @Post(':id/reindex-all')
  @ApiOperation({ summary: 'Reset all files in collection to pending — triggers full re-embedding' })
  @UseGuards(JwtAuthGuard)
  async reindexAll(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.fileService.reindexCollection(id, context);
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
