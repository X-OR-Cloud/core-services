import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

/**
 * Worker mode module — no HTTP server.
 *
 * Purpose: BullMQ audit-ingest processor (introduced in P2).
 * Currently a placeholder; will register `sys-audit-ingest` queue + processor in P2.
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
      { dbName: 'core_sys' },
    ),
  ],
  providers: [],
})
export class AppWorkerModule {}
