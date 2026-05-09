import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { CreateAuditLogDto } from './audit-log.dto';
import { SYS_AUDIT_INGEST_QUEUE } from './audit-log.constants';

/**
 * Audit-log ingest processor.
 *
 * Each job carries either a single event or an array of events. The processor
 * persists via `persistMany` (handles both cases). At low volume this is fine;
 * at high volume the lib can enqueue arrays directly (already supported via
 * SysAuditClient.logBatch — see lib code).
 *
 * Failure handling: BullMQ retries automatically per job options. If the worker
 * itself errors, the job is retried; if all retries exhausted, the event ends
 * up in the failed-jobs set and can be inspected/replayed.
 *
 * Ref: docs/sys/PROPOSAL.md §5.4
 */
@Processor(SYS_AUDIT_INGEST_QUEUE)
export class AuditLogProcessor extends WorkerHost {
  private readonly logger = new Logger('AuditLogProcessor');

  constructor(private readonly service: AuditLogService) {
    super();
  }

  async process(job: Job<{ events?: CreateAuditLogDto[]; event?: CreateAuditLogDto }>): Promise<{
    inserted: number;
    errors: number;
  }> {
    const events = job.data.events ?? (job.data.event ? [job.data.event] : []);
    if (events.length === 0) {
      this.logger.warn('Audit-log job has no events', { jobId: job.id });
      return { inserted: 0, errors: 0 };
    }
    const result = await this.service.persistMany(events);
    if (result.errors > 0) {
      this.logger.warn('Audit-log persist had errors', {
        jobId: job.id,
        attempted: events.length,
        ...result,
      });
    }
    return result;
  }
}
