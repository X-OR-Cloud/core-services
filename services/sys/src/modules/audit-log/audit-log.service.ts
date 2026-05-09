import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { sanitizeObject, sanitizeWithCap } from '@hydrabyte/sys-client';
import { RequestContext, PredefinedRole } from '@hydrabyte/shared';
import { AuditLog } from './audit-log.schema';
import { AuditLogQueryDto, CreateAuditLogDto } from './audit-log.dto';

/**
 * Audit-log Service
 *
 * Read paths:
 *   - findAll  — UI search/filter/pagination
 *   - findById — single record
 *   - getStats — aggregate counts by service/action/time
 *
 * Write paths:
 *   - persist  — used by BullMQ ingest worker (after lib enqueue)
 *   - persistMany — batch from worker
 *
 * RBAC for read:
 *   - universe.owner: see all
 *   - organization.owner / user: only events with actor.orgId == own orgId
 *     (special case: 'system' org events are visible to universe.owner only)
 *
 * Ref: docs/sys/PROPOSAL.md §5
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('AuditLogService');

  constructor(@InjectModel(AuditLog.name) private readonly model: Model<AuditLog>) {}

  // =========================================================================
  // Read
  // =========================================================================

  async findAll(
    query: AuditLogQueryDto,
    context: RequestContext,
  ): Promise<{
    data: AuditLog[];
    pagination: { page: number; limit: number; total: number };
  }> {
    const filter = this.buildFilter(query, context);
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(query.limit ?? 50)));

    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ occurredAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter),
    ]);

    return { data: data as AuditLog[], pagination: { page, limit, total } };
  }

  async findById(id: string, context: RequestContext): Promise<AuditLog> {
    const doc = await this.model.findById(id).lean().exec();
    if (!doc) throw new NotFoundException(`Audit log '${id}' not found`);

    // Org boundary check
    const isUniverseOwner = context.roles?.includes(PredefinedRole.UniverseOwner);
    if (!isUniverseOwner && (doc as any).actor?.orgId !== context.orgId) {
      // Don't leak existence — return 404 instead of 403
      throw new NotFoundException(`Audit log '${id}' not found`);
    }
    return doc as AuditLog;
  }

  /**
   * Aggregate stats: count grouped by service+action over a time window.
   */
  async getStats(
    query: { from?: string; to?: string },
    context: RequestContext,
  ): Promise<Array<{ service: string; action: string; count: number; result: string }>> {
    const match: Record<string, unknown> = {};
    if (query.from || query.to) {
      const range: Record<string, Date> = {};
      if (query.from) range.$gte = new Date(query.from);
      if (query.to) range.$lte = new Date(query.to);
      match['occurredAt'] = range;
    }
    const isUniverseOwner = context.roles?.includes(PredefinedRole.UniverseOwner);
    if (!isUniverseOwner) {
      match['actor.orgId'] = context.orgId;
    }

    const pipeline: any[] = [
      { $match: match },
      {
        $group: {
          _id: { service: '$service', action: '$action', result: '$result' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 200 },
    ];

    const docs = await this.model.aggregate(pipeline);
    return docs.map((d) => ({
      service: d._id.service,
      action: d._id.action,
      result: d._id.result,
      count: d.count,
    }));
  }

  // =========================================================================
  // Write — called by BullMQ worker
  // =========================================================================

  async persist(event: CreateAuditLogDto): Promise<AuditLog> {
    const doc = this.toDocument(event);
    const created = await this.model.create(doc);
    return created.toObject() as AuditLog;
  }

  async persistMany(events: CreateAuditLogDto[]): Promise<{ inserted: number; errors: number }> {
    if (events.length === 0) return { inserted: 0, errors: 0 };
    const docs = events.map((e) => this.toDocument(e));
    try {
      const result = await this.model.insertMany(docs, { ordered: false });
      return { inserted: result.length, errors: 0 };
    } catch (error: any) {
      // ordered:false → partial success possible
      const inserted = error.result?.nInserted ?? error.insertedDocs?.length ?? 0;
      this.logger.warn('persistMany partial failure', {
        attempted: events.length,
        inserted,
        errorName: error.name,
      });
      return { inserted, errors: events.length - inserted };
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Server-side defense in depth: re-sanitize even though lib should have
   * already done so. Truncate caps still apply.
   */
  private toDocument(event: CreateAuditLogDto): Partial<AuditLog> {
    return {
      service: event.service,
      resource: event.resource,
      resourceId: event.resourceId,
      action: event.action,
      keyType: event.keyType ?? null,
      actor: event.actor,
      before: sanitizeObject(event.before),
      after: sanitizeObject(event.after),
      requestPayload: sanitizeWithCap(event.requestPayload),
      responseSummary: event.responseSummary as any,
      result: event.result,
      errorMessage: event.errorMessage,
      errorCode: event.errorCode,
      correlationId: event.correlationId,
      occurredAt: new Date(event.occurredAt),
      durationMs: event.durationMs,
      // BaseSchema fills owner/createdAt/updatedAt; force orgId match for query consistency
      owner: {
        orgId: event.actor.orgId,
        userId: event.actor.userId ?? '',
        groupId: '',
        agentId: event.actor.agentId ?? '',
        appId: event.actor.appId ?? '',
      } as any,
    };
  }

  private buildFilter(query: AuditLogQueryDto, context: RequestContext): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    if (query.service) filter['service'] = query.service;
    if (query.resource) filter['resource'] = query.resource;
    if (query.action) filter['action'] = query.action;
    if (query.userId) filter['actor.userId'] = query.userId;
    if (query.result) filter['result'] = query.result;
    if (query.correlationId) filter['correlationId'] = query.correlationId;
    if (query.from || query.to) {
      const range: Record<string, Date> = {};
      if (query.from) range['$gte'] = new Date(query.from);
      if (query.to) range['$lte'] = new Date(query.to);
      filter['occurredAt'] = range;
    }

    // Org boundary
    const isUniverseOwner = context.roles?.includes(PredefinedRole.UniverseOwner);
    if (isUniverseOwner) {
      // universe.owner can filter by orgId via query.orgId
      if (query.orgId) filter['actor.orgId'] = query.orgId;
    } else {
      if (!context.orgId) {
        throw new ForbiddenException('orgId required to query audit logs');
      }
      filter['actor.orgId'] = context.orgId;
    }
    return filter;
  }
}
