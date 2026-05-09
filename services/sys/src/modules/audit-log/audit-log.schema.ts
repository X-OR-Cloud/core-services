import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type AuditResult = 'success' | 'failure';

/**
 * Audit-log Schema (skeleton — full impl in P2)
 *
 * Centralized audit trail for cross-service action logging.
 * Ref: docs/sys/PROPOSAL.md §5.1
 */
@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog extends BaseSchema {
  @Prop({ required: true, index: true })
  service!: string;

  @Prop({ required: true, index: true })
  resource!: string;

  @Prop()
  resourceId?: string;

  @Prop({ required: true, index: true })
  action!: string;

  @Prop({ type: Object, required: true })
  actor!: {
    userId?: string;
    orgId: string; // 'system' for cron/internal actions
    agentId?: string;
    appId?: string;
    ipAddress?: string;
    userAgent?: string;
  };

  @Prop({ required: true, enum: ['success', 'failure'], index: true })
  result!: AuditResult;

  @Prop()
  errorMessage?: string;

  @Prop()
  errorCode?: string;

  @Prop({ index: true })
  correlationId?: string;

  @Prop({ required: true, index: true })
  occurredAt!: Date;

  @Prop()
  durationMs?: number;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
