import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KnowledgeCollectionController } from './knowledge-collection.controller';
import { KnowledgeCollectionService } from './knowledge-collection.service';
import { KnowledgeCollection, KnowledgeCollectionSchema } from './knowledge-collection.schema';
import { KnowledgeSharedModule } from '../knowledge-shared/knowledge-shared.module';
import { KnowledgeFile, KnowledgeFileSchema } from '../knowledge-file/knowledge-file.schema';
import { KnowledgeChunk, KnowledgeChunkSchema } from '../knowledge-chunk/knowledge-chunk.schema';
import { KnowledgeChunkService } from '../knowledge-chunk/knowledge-chunk.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KnowledgeCollection.name, schema: KnowledgeCollectionSchema },
      { name: KnowledgeFile.name, schema: KnowledgeFileSchema },
      { name: KnowledgeChunk.name, schema: KnowledgeChunkSchema },
    ]),
    KnowledgeSharedModule,
  ],
  controllers: [KnowledgeCollectionController],
  providers: [KnowledgeCollectionService, KnowledgeChunkService],
  exports: [KnowledgeCollectionService, MongooseModule],
})
export class KnowledgeCollectionModule {}
