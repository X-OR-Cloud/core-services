import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, QUEUE_EVENTS } from '../../config/queue.config';

@Injectable()
export class ProductProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.PRODUCTS) private productQueue: Queue,
  ) {}

  async emitProductCreated(product: any) {
    await this.productQueue.add(QUEUE_EVENTS.PRODUCT_CREATED, {
      event: QUEUE_EVENTS.PRODUCT_CREATED,
      data: product,
      timestamp: new Date().toISOString(),
    });
  }

  async emitProductUpdated(product: any) {
    await this.productQueue.add(QUEUE_EVENTS.PRODUCT_UPDATED, {
      event: QUEUE_EVENTS.PRODUCT_UPDATED,
      data: product,
      timestamp: new Date().toISOString(),
    });
  }

  async emitProductDeleted(productId: string) {
    await this.productQueue.add(QUEUE_EVENTS.PRODUCT_DELETED, {
      event: QUEUE_EVENTS.PRODUCT_DELETED,
      data: { id: productId },
      timestamp: new Date().toISOString(),
    });
  }
}
