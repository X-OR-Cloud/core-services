import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KnowledgeChunk } from './knowledge-chunk.schema';

@Injectable()
export class KnowledgeChunkService {
  constructor(
    @InjectModel(KnowledgeChunk.name)
    private readonly chunkModel: Model<KnowledgeChunk>,
  ) {}

  /**
   * Insert chunks in bulk (used by worker after embedding)
   */
  async insertMany(chunks: Partial<KnowledgeChunk>[]): Promise<KnowledgeChunk[]> {
    const docs = await this.chunkModel.insertMany(chunks);
    return docs as unknown as KnowledgeChunk[];
  }

  /**
   * Delete all chunks for a source (file or document)
   * Returns the qdrantPointIds for cleanup in Qdrant
   */
  async deleteBySourceId(sourceId: string): Promise<string[]> {
    const chunks = await this.chunkModel
      .find({ sourceId })
      .select('qdrantPointId')
      .lean()
      .exec();

    const pointIds = chunks.map((c: any) => c.qdrantPointId).filter(Boolean);
    await this.chunkModel.deleteMany({ sourceId });
    return pointIds;
  }

  /**
   * List chunks (without content) — for API listing
   */
  async findAll(
    filter: { collectionId?: string; sourceId?: string; orgId?: string },
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: Partial<KnowledgeChunk>[]; total: number; page: number; limit: number }> {
    const query: Record<string, any> = {};
    if (filter.collectionId) query.collectionId = filter.collectionId;
    if (filter.sourceId) query.sourceId = filter.sourceId;
    if (filter.orgId) query.orgId = filter.orgId;

    const [data, total] = await Promise.all([
      this.chunkModel
        .find(query)
        .select('-content') // exclude heavy content field in list
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.chunkModel.countDocuments(query),
    ]);

    return { data: data as Partial<KnowledgeChunk>[], total, page, limit };
  }

  /**
   * Get chunk by ID (with content)
   */
  async findById(id: string): Promise<KnowledgeChunk | null> {
    const { Types } = require('mongoose');
    return this.chunkModel
      .findById(new Types.ObjectId(id))
      .lean()
      .exec() as Promise<KnowledgeChunk | null>;
  }
}
