import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KnowledgeCollectionController } from './knowledge-collection.controller';
import { KnowledgeCollectionService } from './knowledge-collection.service';
import { KnowledgeCollection, KnowledgeCollectionSchema } from './knowledge-collection.schema';
import { KnowledgeSharedModule } from '../knowledge-shared/knowledge-shared.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KnowledgeCollection.name, schema: KnowledgeCollectionSchema },
    ]),
    KnowledgeSharedModule,
  ],
  controllers: [KnowledgeCollectionController],
  providers: [KnowledgeCollectionService],
  exports: [KnowledgeCollectionService, MongooseModule],
})
export class KnowledgeCollectionModule {}
