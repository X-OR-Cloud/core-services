import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '../modules/audit-log/audit-log.module';

/**
 * Worker mode module — no HTTP server.
 *
 * Purpose: BullMQ `sys-audit-ingest` processor.
 *
 * Run with: MODE=wrk nx run sys:wrk
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRoot(
      process.env['MONGODB_URI'] || 'mongodb://localhost:27017',
      { dbName: 'core-sys' },
    ),
    AuditLogModule.forRootWorker(),
  ],
})
export class AppWorkerModule {}
