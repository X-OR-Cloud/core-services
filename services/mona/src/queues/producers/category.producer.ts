import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, QUEUE_EVENTS } from '../../config/queue.config';

@Injectable()
export class CategoryProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.CATEGORIES) private categoryQueue: Queue,
  ) {}

  async emitCategoryCreated(category: any) {
    await this.categoryQueue.add(QUEUE_EVENTS.CATEGORY_CREATED, {
      event: QUEUE_EVENTS.CATEGORY_CREATED,
      data: category,
      timestamp: new Date().toISOString(),
    });
  }

  async emitCategoryUpdated(category: any) {
    await this.categoryQueue.add(QUEUE_EVENTS.CATEGORY_UPDATED, {
      event: QUEUE_EVENTS.CATEGORY_UPDATED,
      data: category,
      timestamp: new Date().toISOString(),
    });
  }

  async emitCategoryDeleted(categoryId: string) {
    await this.categoryQueue.add(QUEUE_EVENTS.CATEGORY_DELETED, {
      event: QUEUE_EVENTS.CATEGORY_DELETED,
      data: { id: categoryId },
      timestamp: new Date().toISOString(),
    });
  }
}
