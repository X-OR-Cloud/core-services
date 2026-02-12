import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Memory } from './memories.schema';

@Injectable()
export class MemoriesService extends BaseService<Memory> {

  constructor(@InjectModel(Memory.name) memoryModel: Model<Memory>) {
    super(memoryModel as any);
  }

  /**
   * Upsert memory by key - update if exists, create if not
   * @param soulId - Soul ID
   * @param platformUserId - Platform user ID
   * @param key - Memory key
   * @param data - Memory data to upsert
   * @param context - Request context
   * @returns Updated or created memory
   */
  async upsertByKey(
    soulId: string,
    platformUserId: string,
    key: string,
    data: {
      value: string;
      type: string;
      conversationId: string;
      source?: string;
      confidence?: number;
      expiresAt?: Date;
    },
    context: RequestContext
  ): Promise<Memory> {
    this.logger.debug(`Upserting memory by key`, {
      soulId,
      platformUserId,
      key,
      userId: context.userId
    });

    const filter = {
      soulId,
      platformUserId,
      key,
      isDeleted: false
    };

    // Check if memory exists
    const existingMemory = await this.model.findOne(filter).exec();

    if (existingMemory) {
      // Update existing memory
      this.logger.debug(`Updating existing memory: ${existingMemory._id}`);

      const updateData = {
        value: data.value,
        type: data.type,
        conversationId: data.conversationId,
        source: data.source || 'extracted',
        confidence: data.confidence || 1.0,
        expiresAt: data.expiresAt,
        updatedBy: context
      };

      const updatedMemory = await this.model
        .findByIdAndUpdate(existingMemory._id, updateData, { new: true })
        .select('-isDeleted -deletedAt -password')
        .exec();

      this.logger.log(`Memory updated: ${existingMemory._id}`, {
        key,
        soulId,
        platformUserId,
        userId: context.userId
      });

      return updatedMemory;
    } else {
      // Create new memory
      this.logger.debug(`Creating new memory for key: ${key}`);

      const newMemoryData = {
        soulId,
        platformUserId,
        key,
        value: data.value,
        type: data.type,
        conversationId: data.conversationId,
        source: data.source || 'extracted',
        confidence: data.confidence || 1.0,
        expiresAt: data.expiresAt
      };

      const newMemory = await this.create(newMemoryData, context);

      this.logger.log(`Memory created: ${(newMemory as any)._id}`, {
        key,
        soulId,
        platformUserId,
        userId: context.userId
      });

      return newMemory as Memory;
    }
  }

  /**
   * Get memories by platform user, optionally filtered by type
   * @param soulId - Soul ID
   * @param platformUserId - Platform user ID
   * @param type - Optional memory type filter
   * @returns Array of memories
   */
  async getByPlatformUser(
    soulId: string,
    platformUserId: string,
    type?: string
  ): Promise<Memory[]> {
    this.logger.debug(`Getting memories for platform user`, {
      soulId,
      platformUserId,
      type
    });

    const filter: any = {
      soulId,
      platformUserId,
      isDeleted: false,
      $or: [
        { expiresAt: null }, // Permanent memories
        { expiresAt: { $gt: new Date() } } // Not expired
      ]
    };

    if (type) {
      filter.type = type;
    }

    const memories = await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .select('-isDeleted -deletedAt -password')
      .exec();

    this.logger.debug(`Found ${memories.length} memories for platform user`, {
      soulId,
      platformUserId,
      type
    });

    return memories;
  }

  /**
   * Get due reminders for a soul (memories of type 'schedule' that are due)
   * @param soulId - Soul ID
   * @returns Array of due reminder memories
   */
  async getDueReminders(soulId: string): Promise<Memory[]> {
    this.logger.debug(`Getting due reminders for soul: ${soulId}`);

    const now = new Date();

    const dueReminders = await this.model
      .find({
        soulId,
        type: 'schedule',
        expiresAt: { $lte: now },
        isDeleted: false
      })
      .sort({ expiresAt: 1 })
      .select('-isDeleted -deletedAt -password')
      .exec();

    this.logger.debug(`Found ${dueReminders.length} due reminders for soul: ${soulId}`);

    return dueReminders;
  }
}