import { Controller, Get, Post, Body } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { AppService } from './app.service';
import { QUEUE_NAMES } from '../config/queue.config';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectQueue(QUEUE_NAMES.DATA_INGESTION)
    private readonly ingestionQueue: Queue,
  ) {}

  @Get()
  getData() {
    return this.appService.getData();
  }

  /**
   * DEBUG ONLY: Manually trigger a data ingestion job
   * Usage: POST /debug/trigger-ingestion
   * Body: { type: 'newsapi' | 'fred' | 'bytetree' | ..., params: {...} }
   */
  @Post('debug/trigger-ingestion')
  async triggerIngestion(
    @Body() body: { type: string; params?: Record<string, any> },
  ) {
    const { type, params = {} } = body;
    try {
      const job = await this.ingestionQueue.add(
        type,
        { type, params, triggeredAt: new Date().toISOString() },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );
      return {
        success: true,
        message: `Job ${type} queued`,
        jobId: job.id,
        jobName: job.name,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
