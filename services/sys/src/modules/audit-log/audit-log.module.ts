import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from './audit-log.schema';

/**
 * Audit-log Module (skeleton — full impl in P2).
 *
 * P0 only registers the schema. Sanitize/truncate utils, BullMQ ingest worker,
 * decorator/interceptor, search/filter API land in P2.
 *
 * Ref: docs/sys/PLAN_v1.md Phase P2
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }]),
  ],
})
export class AuditLogModule {}
