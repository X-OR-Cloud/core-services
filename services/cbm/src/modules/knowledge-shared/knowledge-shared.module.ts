import { Module } from '@nestjs/common';
import { QdrantService } from './qdrant.service';
import { EmbeddingService } from './embedding.service';
import { ChunkingService } from './chunking.service';
import { OcrService } from './ocr.service';

/**
 * KnowledgeSharedModule — shared services used by all KB modules and the worker
 * Exports QdrantService, EmbeddingService, ChunkingService, OcrService
 */
@Module({
  providers: [QdrantService, EmbeddingService, ChunkingService, OcrService],
  exports: [QdrantService, EmbeddingService, ChunkingService, OcrService],
})
export class KnowledgeSharedModule {}
