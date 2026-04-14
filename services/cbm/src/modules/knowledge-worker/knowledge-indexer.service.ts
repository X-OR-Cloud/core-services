import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import { FileEntity } from '../file/file.schema';
import { FileService } from '../file/file.service';
import { KnowledgeChunk } from '../knowledge-chunk/knowledge-chunk.schema';
import { KnowledgeCollectionService } from '../knowledge-collection/knowledge-collection.service';
import { ChunkingService } from '../knowledge-shared/chunking.service';
import { EmbeddingService } from '../knowledge-shared/embedding.service';
import { QdrantService } from '../knowledge-shared/qdrant.service';
import { OcrService } from '../knowledge-shared/ocr.service';
import { PdfParserService } from '../knowledge-shared/pdf-parser.service';

// Document loaders
import * as mammoth from 'mammoth';
import { TextLoader } from '@langchain/classic/document_loaders/fs/text';

// Batch size for embedding API calls
const EMBEDDING_BATCH_SIZE = 32;

@Injectable()
export class KnowledgeIndexerService {
  private readonly logger = new Logger(KnowledgeIndexerService.name);

  constructor(
    @InjectModel(FileEntity.name)
    private readonly fileModel: Model<FileEntity>,
    @InjectModel(KnowledgeChunk.name)
    private readonly chunkModel: Model<KnowledgeChunk>,
    private readonly fileService: FileService,
    private readonly collectionService: KnowledgeCollectionService,
    private readonly chunkingService: ChunkingService,
    private readonly embeddingService: EmbeddingService,
    private readonly qdrantService: QdrantService,
    private readonly ocrService: OcrService,
    private readonly pdfParserService: PdfParserService,
  ) {}

  /**
   * Full indexing pipeline for a single knowledge file.
   * Steps: extract → chunk → embed → upsert Qdrant → update status
   */
  async indexFile(fileId: string): Promise<void> {
    const file = await this.fileService.findByIdInternal(fileId);
    if (!file || file.purpose !== 'knowledge') {
      this.logger.warn(`File ${fileId} not found, deleted, or not a knowledge file — skipping`);
      return;
    }

    const collectionId = file.ownerRef?.id;
    if (!collectionId) {
      this.logger.warn(`File ${fileId} has no ownerRef.id — marking error`);
      await this.fileService.updateIndexingStatus(fileId, {
        embeddingStatus: 'error',
        errorMessage: 'Missing ownerRef.id (collectionId)',
      });
      return;
    }

    await this.fileService.updateIndexingStatus(fileId, {
      embeddingStatus: 'processing',
      errorMessage: undefined,
    });

    try {
      const collection = await this.collectionService.findByIdInternal(collectionId);
      if (!collection) {
        throw new Error(`KnowledgeCollection ${collectionId} not found`);
      }

      await this.qdrantService.ensureCollection(collection.qdrantCollection!);

      const rawContent = await this.extractText(file);

      await this.fileService.updateIndexingStatus(fileId, { rawContent });

      const chunkingConfig = {
        ...this.chunkingService.getDefaultConfig(),
        ...(collection.chunkingConfig || {}),
      };
      const textChunks = this.chunkingService.chunk(rawContent, chunkingConfig);

      if (textChunks.length === 0) {
        this.logger.warn(`File ${fileId} produced 0 chunks — marking ready with 0 chunks`);
        await this.fileService.updateIndexingStatus(fileId, {
          embeddingStatus: 'ready',
          chunkCount: 0,
        });
        return;
      }

      await this.chunkModel.deleteMany({ sourceId: fileId });

      const chunkTexts = textChunks.map((c) => c.content);
      const vectors = await this.embedInBatches(chunkTexts);

      const qdrantPoints = [];
      const chunkDocs = [];

      for (let i = 0; i < textChunks.length; i++) {
        const pointId = uuidv4();
        const tc = textChunks[i];

        chunkDocs.push({
          orgId: (file as any).owner?.orgId || '',
          collectionId,
          sourceType: 'file' as const,
          sourceId: fileId,
          chunkIndex: tc.chunkIndex,
          content: tc.content,
          metadata: tc.metadata,
          qdrantPointId: pointId,
          createdAt: new Date(),
        });

        qdrantPoints.push({
          id: pointId,
          vector: vectors[i],
          payload: {
            chunkId: '',
            sourceId: fileId,
            sourceType: 'file' as const,
            collectionId,
            orgId: (file as any).owner?.orgId || '',
            content: tc.content,
          },
        });
      }

      const insertedChunks = await this.chunkModel.insertMany(chunkDocs);

      for (let i = 0; i < qdrantPoints.length; i++) {
        qdrantPoints[i].payload.chunkId = (insertedChunks[i] as any)._id.toString();
      }

      await this.qdrantService.upsertPoints(collection.qdrantCollection!, qdrantPoints);

      await this.fileService.updateIndexingStatus(fileId, {
        embeddingStatus: 'ready',
        chunkCount: textChunks.length,
      });

      this.logger.log(`Indexed file ${fileId}: ${textChunks.length} chunks`);
    } catch (error: any) {
      this.logger.error(`Failed to index file ${fileId}: ${error.message}`, error.stack);
      await this.fileService.updateIndexingStatus(fileId, {
        embeddingStatus: 'error',
        errorMessage: error.message?.slice(0, 500) || 'Unknown error',
      });
    }

    // Always update collection stats
    await this.collectionService
      .updateStats(collectionId, {} as any)
      .catch((err) => this.logger.warn(`Stats update failed: ${err.message}`));
  }

  /**
   * Extract raw text from file using the FileService to abstract storage (S3 or local).
   */
  private async extractText(file: FileEntity): Promise<string> {
    const mimeType = file.mimeType;

    try {
      if (mimeType === 'application/pdf') {
        const buffer = await this.fileService.readBuffer(file);
        const markdown = await this.pdfParserService.parseToMarkdown(buffer);

        if (this.ocrService.isTextInsufficient(markdown)) {
          if (this.ocrService.isConfigured()) {
            this.logger.log(
              `PDF text insufficient (${markdown.trim().length} chars) — falling back to OCR: ${file.fileName}`,
            );
            const materialized = await this.fileService.materializeToLocalPath(file);
            try {
              return await this.ocrService.ocrPdf(materialized.path);
            } finally {
              materialized.cleanup();
            }
          } else {
            this.logger.warn(
              `PDF text insufficient for ${file.fileName} and OCR not configured (KB_OCR_API_URL not set)`,
            );
          }
        }

        return markdown;
      }

      if (
        mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        const buffer = await this.fileService.readBuffer(file);
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      }

      if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
        const materialized = await this.fileService.materializeToLocalPath(file);
        try {
          const loader = new TextLoader(materialized.path);
          const docs = await loader.load();
          return docs.map((d) => d.pageContent).join('\n\n');
        } finally {
          materialized.cleanup();
        }
      }

      if (mimeType === 'text/html') {
        const buffer = await this.fileService.readBuffer(file);
        const htmlContent = buffer.toString('utf-8');
        return htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }

      if (
        mimeType ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ) {
        const buffer = await this.fileService.readBuffer(file);
        return buffer.toString('utf-8');
      }

      // Fallback: read as text
      const buffer = await this.fileService.readBuffer(file);
      return buffer.toString('utf-8');
    } catch (error: any) {
      throw new Error(`Text extraction failed for ${file.fileName}: ${error.message}`);
    }
  }

  /**
   * Embed texts in batches to avoid large API payloads
   */
  private async embedInBatches(texts: string[]): Promise<number[][]> {
    const all: number[][] = [];

    for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
      const vectors = await this.embeddingService.embedBatch(batch);
      all.push(...vectors);
    }

    return all;
  }
}
