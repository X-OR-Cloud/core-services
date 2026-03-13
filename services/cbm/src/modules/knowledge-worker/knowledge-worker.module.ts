import { Module } from '@nestjs/common';
import { KnowledgeWorkerService } from './knowledge-worker.service';
import { KnowledgeLockService } from './knowledge-lock.service';
import { KnowledgeIndexerService } from './knowledge-indexer.service';
import { KnowledgeSharedModule } from '../knowledge-shared/knowledge-shared.module';
import { KnowledgeCollectionModule } from '../knowledge-collection/knowledge-collection.module';
import { KnowledgeFileModule } from '../knowledge-file/knowledge-file.module';
import { KnowledgeChunkModule } from '../knowledge-chunk/knowledge-chunk.module';

@Module({
  imports: [
    KnowledgeSharedModule,
    KnowledgeCollectionModule,
    KnowledgeFileModule,
    KnowledgeChunkModule,
  ],
  providers: [KnowledgeLockService, KnowledgeIndexerService, KnowledgeWorkerService],
  exports: [KnowledgeWorkerService],
})
export class KnowledgeWorkerModule {}
