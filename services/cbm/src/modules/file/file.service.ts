import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { FileEntity, FilePurpose, OwnerRefKind, EmbeddingStatus } from './file.schema';
import { S3Service } from '../storage-shared/s3.service';

const KNOWLEDGE_MIME_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
  'text/html': '.html',
  'text/markdown': '.md',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

const ATTACHMENT_MIME_TYPES: RegExp[] = [
  /^image\//,
  /^video\//,
  /^audio\//,
  /^application\/pdf$/,
  /^application\/zip$/,
  /^text\//,
];

const AVATAR_COVER_MIME_TYPES: RegExp[] = [/^image\//];

@Injectable()
export class FileService extends BaseService<FileEntity> {
  protected readonly logger = new Logger(FileService.name);

  constructor(
    @InjectModel(FileEntity.name) private readonly fileModel: Model<FileEntity>,
    private readonly s3Service: S3Service,
  ) {
    super(fileModel);
  }

  /**
   * Override findAll: exclude rawContent and storageKey from list view.
   */
  async findAll(
    options: FindManyOptions,
    context: RequestContext,
  ): Promise<FindManyResult<FileEntity>> {
    options.selectFields = ['-rawContent', '-storageKey'];
    options.statisticFields = ['embeddingStatus', 'purpose'];
    return super.findAll(options, context);
  }

  /**
   * Upload a file with a specific purpose + ownerRef.
   * Handles MIME validation, storage (S3 or local fallback), and DB record.
   */
  async uploadFile(
    file: Express.Multer.File,
    params: {
      purpose: FilePurpose;
      ownerKind?: OwnerRefKind;
      ownerId?: string;
      name?: string;
    },
    context: RequestContext,
  ): Promise<Partial<FileEntity>> {
    this.validateMimeType(file.mimetype, params.purpose);

    const fileId = new Types.ObjectId().toString();
    const storageKey = this.s3Service.buildKey(
      context.orgId || 'default',
      params.purpose,
      fileId,
      file.originalname,
    );

    let storageKind: 's3' | 'local';
    let storageBucket: string | undefined;

    if (this.s3Service.getDriver() === 's3') {
      const result = await this.s3Service.upload(file.buffer, storageKey, file.mimetype);
      storageKind = 's3';
      storageBucket = result.bucket;
    } else {
      // Local fallback for dev
      const storagePath = process.env.KB_STORAGE_PATH || '/data/cbm/knowledge';
      const fullPath = path.join(storagePath, storageKey);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, file.buffer);
      storageKind = 'local';
    }

    const data: any = {
      _id: new Types.ObjectId(fileId),
      name: params.name || file.originalname,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      storageKind,
      storageKey,
      storageBucket,
      purpose: params.purpose,
      ownerRef: params.ownerKind && params.ownerId
        ? { kind: params.ownerKind, id: params.ownerId }
        : undefined,
      embeddingStatus: params.purpose === 'knowledge' ? 'pending' : null,
      chunkCount: params.purpose === 'knowledge' ? 0 : undefined,
    };

    const created = await super.create(data, context);
    this.logger.log(`File uploaded: purpose=${params.purpose} key=${storageKey} id=${fileId}`);
    return created;
  }

  private validateMimeType(mimeType: string, purpose: FilePurpose): void {
    if (purpose === 'knowledge') {
      if (!KNOWLEDGE_MIME_TYPES[mimeType]) {
        throw new BadRequestException(
          `Unsupported knowledge file type: ${mimeType}. Supported: ${Object.keys(KNOWLEDGE_MIME_TYPES).join(', ')}`,
        );
      }
      return;
    }
    if (purpose === 'attachment' || purpose === 'other') {
      if (!ATTACHMENT_MIME_TYPES.some((re) => re.test(mimeType))) {
        throw new BadRequestException(`Unsupported attachment type: ${mimeType}`);
      }
      return;
    }
    if (purpose === 'avatar' || purpose === 'cover') {
      if (!AVATAR_COVER_MIME_TYPES.some((re) => re.test(mimeType))) {
        throw new BadRequestException(`${purpose} must be an image, got: ${mimeType}`);
      }
      return;
    }
  }

  /**
   * Delete file: soft delete in Mongo, keep object on S3 for undelete window.
   */
  async deleteFile(id: string, context: RequestContext): Promise<Partial<FileEntity>> {
    const file = await this.fileModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .lean()
      .exec() as FileEntity | null;

    if (!file) throw new NotFoundException(`File ${id} not found`);

    const result = await super.softDelete(new Types.ObjectId(id) as any, context);
    this.logger.log(`File soft-deleted: ${id}`);
    return result;
  }

  /**
   * Reset embeddingStatus to 'pending' for worker to pick up.
   * Only valid for purpose='knowledge'.
   */
  async reindex(id: string, context: RequestContext): Promise<Partial<FileEntity>> {
    const file = await this.fileModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .lean()
      .exec() as FileEntity | null;

    if (!file) throw new NotFoundException(`File ${id} not found`);
    if (file.purpose !== 'knowledge') {
      throw new BadRequestException(`Reindex is only valid for purpose='knowledge', got: ${file.purpose}`);
    }

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
   * Reindex all knowledge files in a collection.
   */
  async reindexCollection(collectionId: string, _context: RequestContext): Promise<{ queued: number }> {
    const result = await this.fileModel.updateMany(
      {
        purpose: 'knowledge',
        'ownerRef.kind': 'knowledge-collection',
        'ownerRef.id': collectionId,
        isDeleted: false,
      },
      { $set: { embeddingStatus: 'pending', errorMessage: undefined, chunkCount: 0 } },
    );

    this.logger.log(`Reindex collection ${collectionId}: ${result.modifiedCount} files queued`);
    return { queued: result.modifiedCount };
  }

  /**
   * Worker poll: find pending knowledge files.
   */
  async findPendingKnowledgeFiles(limit: number = 10): Promise<FileEntity[]> {
    return this.fileModel
      .find({
        purpose: 'knowledge',
        embeddingStatus: 'pending',
        isDeleted: false,
      })
      .limit(limit)
      .lean()
      .exec() as Promise<FileEntity[]>;
  }

  /**
   * Get raw extracted content of a file (for UI "view source" and agent tool-calls).
   * Only meaningful for knowledge files that have been indexed.
   */
  async getContent(
    id: string,
    context: RequestContext,
  ): Promise<{
    id: string;
    fileName: string;
    name: string;
    mimeType: string;
    fileSize: number;
    content: string;
    charCount: number;
    embeddingStatus: EmbeddingStatus | null | undefined;
  }> {
    const file = (await super.findById(
      new Types.ObjectId(id) as any,
      context,
    )) as FileEntity & { _id: Types.ObjectId };

    const content = file.rawContent || '';
    return {
      id: String(file._id),
      fileName: file.fileName,
      name: file.name,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      content,
      charCount: content.length,
      embeddingStatus: file.embeddingStatus,
    };
  }

  /**
   * Get a signed URL for a file (short-lived GET URL).
   */
  async getSignedUrl(id: string, _context: RequestContext): Promise<{ url: string; expiresIn: number }> {
    const file = await this.fileModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .lean()
      .exec() as FileEntity | null;

    if (!file) throw new NotFoundException(`File ${id} not found`);

    if (file.storageKind === 'local') {
      // For local storage, return a path-based URL (dev-only convenience)
      return {
        url: `local://${file.storageKey}`,
        expiresIn: 0,
      };
    }

    const url = await this.s3Service.presignGetUrl(file.storageKey);
    return { url, expiresIn: this.s3Service.getPresignExpires() };
  }

  /**
   * Read file buffer for server-side processing (e.g., indexer).
   * Abstracts S3 vs local.
   */
  async readBuffer(file: FileEntity): Promise<Buffer> {
    if (file.storageKind === 'local') {
      const storagePath = process.env.KB_STORAGE_PATH || '/data/cbm/knowledge';
      const fullPath = path.join(storagePath, file.storageKey);
      if (!fs.existsSync(fullPath)) {
        throw new NotFoundException(`File not found on disk: ${fullPath}`);
      }
      return fs.readFileSync(fullPath);
    }
    return this.s3Service.getBuffer(file.storageKey);
  }

  /**
   * Materialize file to a local path (downloads to tmp if S3).
   * Returns a path the caller can pass to libraries that require filesystem access.
   * Caller is responsible for cleanup via the returned `cleanup` function.
   */
  async materializeToLocalPath(file: FileEntity): Promise<{ path: string; cleanup: () => void }> {
    if (file.storageKind === 'local') {
      const storagePath = process.env.KB_STORAGE_PATH || '/data/cbm/knowledge';
      const fullPath = path.join(storagePath, file.storageKey);
      if (!fs.existsSync(fullPath)) {
        throw new NotFoundException(`File not found on disk: ${fullPath}`);
      }
      return { path: fullPath, cleanup: () => {} };
    }
    const buffer = await this.s3Service.getBuffer(file.storageKey);
    const tmpDir = process.env.CBM_TMP_DIR || '/tmp';
    const ext = path.extname(file.fileName) || '';
    const tmpPath = path.join(tmpDir, `cbm-file-${randomUUID()}${ext}`);
    fs.writeFileSync(tmpPath, buffer);
    return {
      path: tmpPath,
      cleanup: () => {
        try {
          fs.unlinkSync(tmpPath);
        } catch { /* ignore */ }
      },
    };
  }

  /**
   * Internal lookup by ID (no access control — for worker/indexer use).
   */
  async findByIdInternal(id: string): Promise<FileEntity | null> {
    return this.fileModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .lean()
      .exec() as Promise<FileEntity | null>;
  }

  /**
   * Update file status fields (for indexer use).
   */
  async updateIndexingStatus(
    id: string,
    patch: Partial<Pick<FileEntity, 'embeddingStatus' | 'errorMessage' | 'chunkCount' | 'rawContent'>>,
  ): Promise<void> {
    await this.fileModel.updateOne({ _id: new Types.ObjectId(id) }, { $set: patch });
  }
}
