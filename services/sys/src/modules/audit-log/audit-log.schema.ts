import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type AuditResult = 'success' | 'failure';
export type AuditKeyType = 'setting' | 'sensitive_setting';

/**
 * Audit-log Schema
 *
 * Centralized audit trail for cross-service action logging.
 * Service consumers ghi qua @hydrabyte/sys-client (fire-and-forget BullMQ).
 *
 * Ref: docs/sys/PROPOSAL.md §5.1
 */
@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog extends BaseSchema {
  // What
  @Prop({ required: true, index: true })
  service!: string;

  @Prop({ required: true, index: true })
  resource!: string;

  @Prop()
  resourceId?: string;

  @Prop({ required: true, index: true })
  action!: string;

  /** Filter helper to distinguish setting vs sensitive_setting reads in audit queries. */
  @Prop({ type: String, enum: ['setting', 'sensitive_setting', null], default: null })
  keyType?: AuditKeyType | null;

  // Who
  @Prop({ type: Object, required: true })
  actor!: {
    userId?: string;
    orgId: string; // 'system' for cron/internal actions
    agentId?: string;
    appId?: string;
    ipAddress?: string;
    userAgent?: string;
  };

  // Diff (sanitized + truncated upstream by lib)
  @Prop({ type: Object })
  before?: Record<string, unknown>;

  @Prop({ type: Object })
  after?: Record<string, unknown>;

  @Prop({ type: Object })
  requestPayload?: Record<string, unknown>;

  @Prop({ type: Object })
  responseSummary?: {
    id?: string;
    status?: number;
    size?: number;
  };

  // Result
  @Prop({ required: true, enum: ['success', 'failure'], index: true })
  result!: AuditResult;

  @Prop()
  errorMessage?: string;

  @Prop()
  errorCode?: string;

  // Tracing
  @Prop({ index: true })
  correlationId?: string;

  @Prop({ required: true, index: true })
  occurredAt!: Date;

  @Prop()
  durationMs?: number;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Indexes — query patterns from PROPOSAL §5.1
AuditLogSchema.index({ 'actor.orgId': 1, occurredAt: -1 }); // org+time (primary use case)
AuditLogSchema.index({ service: 1, resource: 1, action: 1, occurredAt: -1 }); // event-type filter
AuditLogSchema.index({ 'actor.userId': 1, occurredAt: -1 }); // user activity
AuditLogSchema.index(
  { keyType: 1, occurredAt: -1 },
  { partialFilterExpression: { keyType: { $type: 'string' } } },
); // secret/setting access query (small, only when keyType is set)
