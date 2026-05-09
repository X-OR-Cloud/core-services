import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { sanitizeObject, sanitizeWithCap } from './audit-sanitize.util';
import { AuditEventInput, SysClientOptions } from './sys-client.types';
import { SysClientMetrics } from './sys-client.metrics';

const SYS_CLIENT_OPTIONS = 'SYS_CLIENT_OPTIONS';
const SYS_CLIENT_METRICS = 'SYS_CLIENT_METRICS';

const QUEUE_NAME = 'sys-audit-ingest';
const JOB_NAME = 'audit-event';

const SYSTEM_ORG = 'system';

/**
 * SysAuditClient — fire-and-forget audit-log producer.
 *
 * Behavior:
 *   - log()  / logBatch() return synchronously; underlying enqueue is async.
 *   - Sanitize + truncate before enqueue (lib responsibility — sys-side has
 *     a second sanitize pass for defense-in-depth).
 *   - Auto-fill `service` from options.serviceName.
 *   - Default `actor.orgId = 'system'` when caller doesn't supply one (cron,
 *     internal jobs, anonymous flows).
 *   - Redis down → log to stdout with marker `AUDIT_FALLBACK` so the event
 *     can be recovered manually from container logs. Never throws.
 *
 * Ref: docs/sys/PROPOSAL.md §5.4, §6.6
 */
@Injectable()
export class SysAuditClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('SysAuditClient');
  private queue: Queue | null = null;
  private enabled = true;

  constructor(
    @Inject(SYS_CLIENT_OPTIONS) private readonly options: SysClientOptions,
    @Inject(SYS_CLIENT_METRICS) private readonly metrics: SysClientMetrics | null,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.options.disabled || this.options.auditDisabled) {
      this.logger.warn('SysAuditClient disabled — log() calls will no-op');
      this.enabled = false;
      return;
    }
    try {
      this.queue = this._buildQueue();
      // Light probe — wait up to 1s for the underlying client to be 'ready'
      await Promise.race([
        this.queue.waitUntilReady(),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
      this.logger.log(`SysAuditClient ready (queue: ${QUEUE_NAME})`);
    } catch (error: any) {
      this.logger.warn('SysAuditClient init failed — log() will fall back to stdout', {
        error: error.message,
      });
      this.queue = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      try {
        await this.queue.close();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Fire-and-forget audit log. Returns synchronously (Promise that always resolves).
   */
  log(event: AuditEventInput): void {
    if (!this.enabled) return;
    void this._enqueue([event]);
  }

  /**
   * Batch fire-and-forget. Useful when caller already has an array.
   */
  logBatch(events: AuditEventInput[]): void {
    if (!this.enabled || events.length === 0) return;
    void this._enqueue(events);
  }

  private async _enqueue(events: AuditEventInput[]): Promise<void> {
    const normalized = events.map((e) => this._normalize(e));

    if (!this.queue) {
      this._fallbackLog('queue_unavailable', normalized);
      this.metrics?.auditEnqueueFailed.inc({ reason: 'queue_unavailable' });
      return;
    }

    try {
      // Single job carrying possibly-many events. Worker handles both shapes.
      await this.queue.add(
        JOB_NAME,
        normalized.length === 1 ? { event: normalized[0] } : { events: normalized },
        {
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
          attempts: 3,
          backoff: { type: 'exponential', delay: 500 },
        },
      );
      for (const ev of normalized) {
        this.metrics?.auditEnqueue.inc({
          service: (ev['service'] as string) ?? this.options.serviceName,
          action: (ev['action'] as string) ?? 'unknown',
          result: (ev['result'] as string) ?? 'unknown',
        });
      }
    } catch (error: any) {
      this._fallbackLog('enqueue_error', normalized, error.message);
      this.metrics?.auditEnqueueFailed.inc({ reason: 'enqueue_error' });
    }
  }

  /**
   * Fill in defaults: service, occurredAt, actor.orgId='system'. Sanitize + truncate.
   */
  private _normalize(input: AuditEventInput): Record<string, unknown> {
    const actor = {
      userId: input.actor?.userId,
      orgId: input.actor?.orgId || SYSTEM_ORG,
      agentId: input.actor?.agentId,
      appId: input.actor?.appId,
      ipAddress: input.actor?.ipAddress,
      userAgent: input.actor?.userAgent,
    };
    return {
      service: this.options.serviceName,
      resource: input.resource,
      resourceId: input.resourceId,
      action: input.action,
      keyType: input.keyType,
      actor,
      before: sanitizeObject(input.before),
      after: sanitizeObject(input.after),
      requestPayload: sanitizeWithCap(input.requestPayload),
      responseSummary: input.responseSummary,
      result: input.result,
      errorMessage: input.errorMessage,
      errorCode: input.errorCode,
      correlationId: input.correlationId,
      occurredAt: (input.occurredAt ?? new Date()).toISOString(),
      durationMs: input.durationMs,
    };
  }

  /**
   * When BullMQ is unavailable, dump a structured log line to stdout with a
   * marker so log shipping can route to a "lost audit" pipeline if desired.
   */
  private _fallbackLog(reason: string, events: unknown[], errorMessage?: string): void {
    for (const event of events) {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          marker: 'AUDIT_FALLBACK',
          reason,
          errorMessage,
          event,
        }),
      );
    }
    this.logger.warn('Audit fallback engaged', { reason, count: events.length });
  }

  private _buildQueue(): Queue {
    const url =
      this.options.redisUrl ||
      (() => {
        const host = this.options.redisHost || 'localhost';
        const port = this.options.redisPort || 6379;
        const user = this.options.redisUsername || '';
        const pass = this.options.redisPassword || '';
        return pass
          ? `redis://${user}:${encodeURIComponent(pass)}@${host}:${port}`
          : `redis://${host}:${port}`;
      })();
    return new Queue(QUEUE_NAME, {
      connection: {
        // bullmq accepts a URL string here directly via `url` field on connection
        // but ioredis-style options also work. Use URL for simplicity.
        url,
      } as any,
    });
  }
}

export { SYS_CLIENT_OPTIONS as AUDIT_OPTIONS_TOKEN, SYS_CLIENT_METRICS as AUDIT_METRICS_TOKEN };
