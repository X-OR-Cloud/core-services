import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, QUEUE_EVENTS } from '../../config/queue.config';

@Injectable()
export class ReportProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.REPORTS) private reportQueue: Queue,
  ) {}

  async emitReportGenerate(reportType: string) {
    const job = await this.reportQueue.add(QUEUE_EVENTS.REPORT_GENERATE, {
      event: QUEUE_EVENTS.REPORT_GENERATE,
      data: { reportType },
      timestamp: new Date().toISOString(),
    });
    return job;
  }
}
