import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AgentMemory, MemoryCategory } from './memory.schema';
import { SearchMemoryDto, UpsertMemoryDto, ListMemoryKeysDto } from './memory.dto';

@Injectable()
export class MemoryService {
  constructor(
    @InjectModel(AgentMemory.name) private readonly memoryModel: Model<AgentMemory>
  ) {}

  /**
   * Full-text search memory entries by keyword, scoped to agentId
   */
  async search(agentId: string, dto: SearchMemoryDto) {
    const limit = dto.limit ?? 5;
    const filter: Record<string, any> = {
      agentId,
      deletedAt: null,
      $text: { $search: dto.keyword },
    };
    if (dto.category) filter.category = dto.category;

    const [results, total] = await Promise.all([
      this.memoryModel
        .find(filter, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' }, updatedAt: -1 })
        .limit(limit)
        .select('category key content tags updatedAt')
        .lean()
        .exec(),
      this.memoryModel.countDocuments(filter).exec(),
    ]);

    return {
      results: results.map((r) => ({
        category: r.category,
        key: r.key,
        content: r.content,
        tags: r.tags,
        updatedAt: (r as any).updatedAt,
      })),
      total,
    };
  }

  /**
   * Upsert a memory entry by (agentId, category, key)
   */
  async upsert(agentId: string, dto: UpsertMemoryDto) {
    const filter = { agentId, category: dto.category, key: dto.key };
    const update = {
      $set: {
        content: dto.content,
        tags: dto.tags ?? [],
        deletedAt: null,
      },
      $setOnInsert: { agentId, category: dto.category, key: dto.key },
    };

    const before = await this.memoryModel.findOne(filter).lean().exec();
    const result = await this.memoryModel.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
    });

    return {
      action: before ? 'updated' : 'created',
      key: result.key,
      updatedAt: (result as any).updatedAt,
    };
  }

  /**
   * List all keys (no content), scoped to agentId
   */
  async listKeys(agentId: string, dto: ListMemoryKeysDto) {
    const filter: Record<string, any> = { agentId, deletedAt: null };
    if (dto.category) filter.category = dto.category;

    const keys = await this.memoryModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .select('category key tags updatedAt')
      .lean()
      .exec();

    return {
      keys: keys.map((k) => ({
        category: k.category as MemoryCategory,
        key: k.key,
        tags: k.tags,
        updatedAt: (k as any).updatedAt,
      })),
      total: keys.length,
    };
  }

  /**
   * Soft delete a memory entry by (agentId, category, key)
   */
  async delete(agentId: string, category: MemoryCategory, key: string) {
    const result = await this.memoryModel
      .findOneAndUpdate(
        { agentId, category, key, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { new: true }
      )
      .lean()
      .exec();

    if (!result) {
      throw new NotFoundException(`Memory not found: ${category}/${key}`);
    }

    return { deleted: true, key };
  }
}
