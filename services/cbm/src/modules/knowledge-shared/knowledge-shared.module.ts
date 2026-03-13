import { Module } from '@nestjs/common';
import { QdrantService } from './qdrant.service';
import { EmbeddingService } from './embedding.service';
import { ChunkingService } from './chunking.service';

/**
 * KnowledgeSharedModule — shared services used by all KB modules and the worker
 * Exports QdrantService, EmbeddingService, ChunkingService
 */
@Module({
  providers: [QdrantService, EmbeddingService, ChunkingService],
  exports: [QdrantService, EmbeddingService, ChunkingService],
})
export class KnowledgeSharedModule {}
