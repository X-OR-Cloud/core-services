import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import { KnowledgeFile } from '../knowledge-file/knowledge-file.schema';
import { KnowledgeChunk } from '../knowledge-chunk/knowledge-chunk.schema';
import { KnowledgeCollectionService } from '../knowledge-collection/knowledge-collection.service';
import { ChunkingService } from '../knowledge-shared/chunking.service';
import { EmbeddingService } from '../knowledge-shared/embedding.service';
import { QdrantService } from '../knowledge-shared/qdrant.service';
import { OcrService } from '../knowledge-shared/ocr.service';

// Document loaders
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');
import * as mammoth from 'mammoth';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { TextLoader } from '@langchain/classic/document_loaders/fs/text';

// Batch size for embedding API calls
const EMBEDDING_BATCH_SIZE = 32;

@Injectable()
export class KnowledgeIndexerService {
  private readonly logger = new Logger(KnowledgeIndexerService.name);

  constructor(
    @InjectModel(KnowledgeFile.name)
    private readonly fileModel: Model<KnowledgeFile>,
    @InjectModel(KnowledgeChunk.name)
    private readonly chunkModel: Model<KnowledgeChunk>,
    private readonly collectionService: KnowledgeCollectionService,
    private readonly chunkingService: ChunkingService,
    private readonly embeddingService: EmbeddingService,
    private readonly qdrantService: QdrantService,
    private readonly ocrService: OcrService,
  ) {}

  /**
   * Full indexing pipeline for a single file.
   * Steps: extract → chunk → embed → upsert Qdrant → update status
   */
  async indexFile(fileId: string): Promise<void> {
    // 1. Load file record
    const file = await this.fileModel
      .findOne({ _id: new Types.ObjectId(fileId), isDeleted: false })
      .lean()
      .exec() as KnowledgeFile | null;

    if (!file) {
      this.logger.warn(`File ${fileId} not found or deleted — skipping`);
      return;
    }

    // 2. Mark as processing
    await this.fileModel.updateOne(
      { _id: new Types.ObjectId(fileId) },
      { $set: { embeddingStatus: 'processing', errorMessage: undefined } },
    );

    try {
      // 3. Load collection config
      const collection = await this.collectionService.findByIdInternal(file.collectionId);
      if (!collection) {
        throw new Error(`KnowledgeCollection ${file.collectionId} not found`);
      }

      // 4. Ensure Qdrant collection exists
      await this.qdrantService.ensureCollection(collection.qdrantCollection!);

      // 5. Extract raw text from file
      const rawContent = await this.extractText(file);

      // Save rawContent to file record
      await this.fileModel.updateOne(
        { _id: new Types.ObjectId(fileId) },
        { $set: { rawContent } },
      );

      // 6. Chunk text using collection config
      const chunkingConfig = {
        ...this.chunkingService.getDefaultConfig(),
        ...(collection.chunkingConfig || {}),
      };
      const textChunks = this.chunkingService.chunk(rawContent, chunkingConfig);

      if (textChunks.length === 0) {
        this.logger.warn(`File ${fileId} produced 0 chunks — marking ready with 0 chunks`);
        await this.fileModel.updateOne(
          { _id: new Types.ObjectId(fileId) },
          { $set: { embeddingStatus: 'ready', chunkCount: 0 } },
        );
        return;
      }

      // 7. Delete old chunks for this file (re-index scenario)
      await this.chunkModel.deleteMany({ sourceId: fileId });

      // 8. Batch embedding
      const chunkTexts = textChunks.map((c) => c.content);
      const vectors = await this.embedInBatches(chunkTexts);

      // 9. Build chunk records + Qdrant points
      const qdrantPoints = [];
      const chunkDocs = [];

      for (let i = 0; i < textChunks.length; i++) {
        const pointId = uuidv4();
        const tc = textChunks[i];

        chunkDocs.push({
          orgId: (file as any).owner?.orgId || '',
          collectionId: file.collectionId,
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
            chunkId: '', // will be set after mongo insert
            sourceId: fileId,
            sourceType: 'file' as const,
            collectionId: file.collectionId,
            orgId: (file as any).owner?.orgId || '',
            content: tc.content,
          },
        });
      }

      // 10. Insert chunks into MongoDB
      const insertedChunks = await this.chunkModel.insertMany(chunkDocs);

      // 11. Update qdrant payloads with real chunkIds
      for (let i = 0; i < qdrantPoints.length; i++) {
        qdrantPoints[i].payload.chunkId = (insertedChunks[i] as any)._id.toString();
      }

      // 12. Upsert into Qdrant
      await this.qdrantService.upsertPoints(collection.qdrantCollection!, qdrantPoints);

      // 13. Update file: ready + chunkCount
      await this.fileModel.updateOne(
        { _id: new Types.ObjectId(fileId) },
        { $set: { embeddingStatus: 'ready', chunkCount: textChunks.length } },
      );

      this.logger.log(`Indexed file ${fileId}: ${textChunks.length} chunks`);
    } catch (error: any) {
      this.logger.error(`Failed to index file ${fileId}: ${error.message}`, error.stack);
      await this.fileModel.updateOne(
        { _id: new Types.ObjectId(fileId) },
        {
          $set: {
            embeddingStatus: 'error',
            errorMessage: error.message?.slice(0, 500) || 'Unknown error',
          },
        },
      );
    }

    // Always update collection stats
    const updatedFile = await this.fileModel
      .findOne({ _id: new Types.ObjectId(fileId) })
      .lean()
      .exec() as KnowledgeFile | null;

    if (updatedFile?.collectionId) {
      await this.collectionService
        .updateStats(updatedFile.collectionId, {} as any)
        .catch((err) => this.logger.warn(`Stats update failed: ${err.message}`));
    }
  }

  /**
   * Extract raw text from file using LangChain loaders
   */
  private async extractText(file: KnowledgeFile): Promise<string> {
    const storagePath = process.env.KB_STORAGE_PATH || '/data/cbm/knowledge';
    const absolutePath = path.join(storagePath, file.filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found on disk: ${absolutePath}`);
    }

    const mimeType = file.mimeType;

    try {
      if (mimeType === 'application/pdf') {
        const buffer = fs.readFileSync(absolutePath);
        const data = await pdfParse(buffer);

        // Fallback to OCR if text is insufficient (image-based PDF)
        if (this.ocrService.isTextInsufficient(data.text)) {
          if (this.ocrService.isConfigured()) {
            this.logger.log(`PDF text insufficient (${data.text.trim().length} chars) — falling back to OCR: ${file.fileName}`);
            return this.ocrService.ocrPdf(absolutePath);
          } else {
            this.logger.warn(`PDF text insufficient for ${file.fileName} and OCR not configured (KB_OCR_API_URL not set)`);
          }
        }

        return data.text;
      }

      if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const buffer = fs.readFileSync(absolutePath);
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      }

      if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
        const loader = new TextLoader(absolutePath);
        const docs = await loader.load();
        return docs.map((d) => d.pageContent).join('\n\n');
      }

      if (mimeType === 'text/html') {
        // Strip HTML tags using regex (no external dependency needed)
        const htmlContent = fs.readFileSync(absolutePath, 'utf-8');
        return htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }

      if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        // XLSX: read as binary and extract text via fallback
        return fs.readFileSync(absolutePath, 'utf-8');
      }

      // Fallback: read as text
      return fs.readFileSync(absolutePath, 'utf-8');
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
