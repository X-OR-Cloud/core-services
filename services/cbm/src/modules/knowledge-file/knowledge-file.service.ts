import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import * as path from 'path';
import * as fs from 'fs';
import type { Multer } from 'multer';
import { KnowledgeFile } from './knowledge-file.schema';
import { QdrantService } from '../knowledge-shared/qdrant.service';
import { KnowledgeCollectionService } from '../knowledge-collection/knowledge-collection.service';

// Supported MIME types via LangChain loaders
const SUPPORTED_MIME_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
  'text/html': '.html',
  'text/markdown': '.md',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

@Injectable()
export class KnowledgeFileService extends BaseService<KnowledgeFile> {
  protected readonly logger = new Logger(KnowledgeFileService.name);

  constructor(
    @InjectModel(KnowledgeFile.name)
    private readonly fileModel: Model<KnowledgeFile>,
    private readonly qdrantService: QdrantService,
    private readonly collectionService: KnowledgeCollectionService,
  ) {
    super(fileModel);
  }

  /**
   * Override findAll: exclude rawContent and filePath from list view
   */
  async findAll(
    options: FindManyOptions,
    context: RequestContext,
  ): Promise<FindManyResult<KnowledgeFile>> {
    options.selectFields = ['-rawContent', '-filePath'];
    options.statisticFields = ['embeddingStatus'];
    return super.findAll(options, context);
  }

  /**
   * Save uploaded file to disk and create DB record
   */
  async uploadFile(
    file: Multer.File,
    collectionId: string,
    displayName: string | undefined,
    context: RequestContext,
  ): Promise<Partial<KnowledgeFile>> {
    const mimeType = file.mimetype;
    if (!SUPPORTED_MIME_TYPES[mimeType]) {
      throw new BadRequestException(
        `Unsupported file type: ${mimeType}. Supported: ${Object.keys(SUPPORTED_MIME_TYPES).join(', ')}`,
      );
    }

    // Ensure storage directory
    const storagePath = process.env.KB_STORAGE_PATH || '/data/cbm/knowledge';
    const orgDir = path.join(storagePath, context.orgId || 'default');
    if (!fs.existsSync(orgDir)) {
      fs.mkdirSync(orgDir, { recursive: true });
    }

    // Save file with unique name
    const uniqueFileName = `${Date.now()}_${file.originalname}`;
    const absolutePath = path.join(orgDir, uniqueFileName);
    const relativePath = path.join(context.orgId || 'default', uniqueFileName);

    fs.writeFileSync(absolutePath, file.buffer);

    const fileRecord = await super.create(
      {
        collectionId,
        name: displayName || file.originalname,
        fileName: file.originalname,
        filePath: relativePath,
        mimeType,
        fileSize: file.size,
        embeddingStatus: 'pending',
        chunkCount: 0,
      },
      context,
    );

    // Update collection stats
    if ((fileRecord as any)._id) {
      await this.collectionService.updateStats(collectionId, context).catch((err) =>
        this.logger.warn(`Failed to update collection stats: ${err.message}`),
      );
    }

    this.logger.log(`File uploaded: ${file.originalname} → ${relativePath}`);
    return fileRecord;
  }

  /**
   * Delete file: remove from disk + Qdrant + Mongo
   */
  async deleteFile(id: string, context: RequestContext): Promise<Partial<KnowledgeFile>> {
    const file = await this.fileModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .lean()
      .exec() as KnowledgeFile | null;

    if (!file) throw new NotFoundException(`File ${id} not found`);

    // Delete Qdrant points for this file
    const collection = await this.collectionService.findByIdInternal(file.collectionId);
    if (collection?.qdrantCollection) {
      await this.qdrantService
        .deletePointsByFilter(collection.qdrantCollection, {
          must: [{ key: 'sourceId', match: { value: id } }],
        })
        .catch((err) =>
          this.logger.warn(`Failed to delete Qdrant points for file ${id}: ${err.message}`),
        );
    }

    // Soft delete from MongoDB (KnowledgeChunk cleanup handled by worker/chunk service)
    const result = await super.softDelete(new Types.ObjectId(id) as any, context);

    // Update collection stats
    await this.collectionService
      .updateStats(file.collectionId, context)
      .catch((err) => this.logger.warn(`Failed to update stats: ${err.message}`));

    return result;
  }

  /**
   * Trigger reindex: reset embeddingStatus to 'pending' for the worker to pick up
   */
  async reindex(id: string, context: RequestContext): Promise<Partial<KnowledgeFile>> {
    const file = await this.fileModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .lean()
      .exec() as KnowledgeFile | null;

    if (!file) throw new NotFoundException(`File ${id} not found`);

    await this.fileModel.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $set: {
          embeddingStatus: 'pending',
          errorMessage: undefined,
          chunkCount: 0,
        },
      },
    );

    this.logger.log(`Reindex triggered for file: ${id}`);
    return { ...(file as any), embeddingStatus: 'pending', chunkCount: 0 };
  }

  /**
   * Find all pending files for worker processing
   */
  async findPendingFiles(limit: number = 10): Promise<KnowledgeFile[]> {
    return this.fileModel
      .find({ embeddingStatus: 'pending', isDeleted: false })
      .limit(limit)
      .lean()
      .exec() as Promise<KnowledgeFile[]>;
  }
}
