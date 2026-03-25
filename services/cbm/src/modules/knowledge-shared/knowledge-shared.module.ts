import { Module } from '@nestjs/common';
import { QdrantService } from './qdrant.service';
import { EmbeddingService } from './embedding.service';
import { ChunkingService } from './chunking.service';
import { OcrService } from './ocr.service';
import { PdfParserService } from './pdf-parser.service';

/**
 * KnowledgeSharedModule — shared services used by all KB modules and the worker
 * Exports QdrantService, EmbeddingService, ChunkingService, OcrService, PdfParserService
 */
@Module({
  providers: [QdrantService, EmbeddingService, ChunkingService, OcrService, PdfParserService],
  exports: [QdrantService, EmbeddingService, ChunkingService, OcrService, PdfParserService],
})
export class KnowledgeSharedModule {}
