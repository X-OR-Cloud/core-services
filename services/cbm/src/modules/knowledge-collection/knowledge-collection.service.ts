import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { KnowledgeCollection, CollectionStats } from './knowledge-collection.schema';
import { CreateKnowledgeCollectionDto } from './knowledge-collection.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class KnowledgeCollectionService extends BaseService<KnowledgeCollection> {
  constructor(
    @InjectModel(KnowledgeCollection.name)
    private readonly collectionModel: Model<KnowledgeCollection>,
  ) {
    super(collectionModel);
  }

  /**
   * Override create: auto-generate qdrantCollection name + set embeddingModel default
   */
  async create(
    data: CreateKnowledgeCollectionDto,
    context: RequestContext,
  ): Promise<Partial<KnowledgeCollection>> {
    const embeddingModel =
      data.embeddingModel ||
      process.env.KB_EMBEDDING_MODEL ||
      'Qwen/Qwen3-Embedding-8B';

    const qdrantCollection = `kc_${uuidv4().replace(/-/g, '')}`;

    return super.create(
      {
        ...data,
        embeddingModel,
        qdrantCollection,
        status: 'idle',
        stats: new CollectionStats(),
      },
      context,
    );
  }

  /**
   * Override findAll: exclude qdrantCollection and embeddingModel from list view
   */
  async findAll(
    options: FindManyOptions,
    context: RequestContext,
  ): Promise<FindManyResult<KnowledgeCollection>> {
    options.selectFields = ['-qdrantCollection', '-embeddingModel'];
    options.statisticFields = ['status'];
    return super.findAll(options, context);
  }

  /**
   * Update collection stats (called after file status changes)
   */
  async updateStats(
    collectionId: string,
    context: RequestContext,
  ): Promise<void> {
    const stats = await this.collectionModel.aggregate([
      {
        $lookup: {
          from: 'knowledge_files',
          let: { collectionId: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$collectionId', '$$collectionId'] },
                isDeleted: false,
              },
            },
          ],
          as: 'files',
        },
      },
      { $match: { _id: this.toObjectId(collectionId), isDeleted: false } },
      {
        $project: {
          totalFiles: { $size: '$files' },
          readyFiles: {
            $size: {
              $filter: {
                input: '$files',
                as: 'f',
                cond: { $eq: ['$$f.embeddingStatus', 'ready'] },
              },
            },
          },
          processingFiles: {
            $size: {
              $filter: {
                input: '$files',
                as: 'f',
                cond: { $eq: ['$$f.embeddingStatus', 'processing'] },
              },
            },
          },
          errorFiles: {
            $size: {
              $filter: {
                input: '$files',
                as: 'f',
                cond: { $eq: ['$$f.embeddingStatus', 'error'] },
              },
            },
          },
          pendingFiles: {
            $size: {
              $filter: {
                input: '$files',
                as: 'f',
                cond: { $eq: ['$$f.embeddingStatus', 'pending'] },
              },
            },
          },
          totalSize: { $sum: '$files.fileSize' },
          totalChunks: { $sum: '$files.chunkCount' },
        },
      },
    ]);

    if (stats.length > 0) {
      const s = stats[0];
      await this.collectionModel.updateOne(
        { _id: this.toObjectId(collectionId) },
        {
          $set: {
            stats: {
              totalFiles: s.totalFiles || 0,
              readyFiles: s.readyFiles || 0,
              processingFiles: s.processingFiles || 0,
              errorFiles: s.errorFiles || 0,
              pendingFiles: s.pendingFiles || 0,
              totalSize: s.totalSize || 0,
              totalChunks: s.totalChunks || 0,
            },
          },
        },
      );
    }
  }

  /**
   * Get collection with qdrantCollection field (internal use for worker/search)
   */
  async findByIdInternal(collectionId: string): Promise<KnowledgeCollection | null> {
    return this.collectionModel
      .findOne({ _id: this.toObjectId(collectionId), isDeleted: false })
      .lean()
      .exec() as Promise<KnowledgeCollection | null>;
  }

  private toObjectId(id: string) {
    const { Types } = require('mongoose');
    return new Types.ObjectId(id);
  }
}
