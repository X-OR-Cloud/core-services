import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { COMMON_CONFIG, SERVICE_CONFIG, buildMongoUri } from '@hydrabyte/shared';
import { KnowledgeWorkerModule } from './modules/knowledge-worker/knowledge-worker.module';

/**
 * KbWorkerModule — standalone NestJS app for the Knowledge Base indexing worker.
 * Run via: nx run cbm:kb-wrk
 *
 * Connects to MongoDB + Redis, polls for pending files, runs indexing pipeline.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      buildMongoUri(`${COMMON_CONFIG.DatabaseNamePrefix}${SERVICE_CONFIG.cbm.name}`),
    ),
    KnowledgeWorkerModule,
  ],
})
export class KbWorkerModule {}
