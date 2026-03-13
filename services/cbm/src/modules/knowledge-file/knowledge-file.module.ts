import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { KnowledgeFileController } from './knowledge-file.controller';
import { KnowledgeFileService } from './knowledge-file.service';
import { KnowledgeFile, KnowledgeFileSchema } from './knowledge-file.schema';
import { KnowledgeSharedModule } from '../knowledge-shared/knowledge-shared.module';
import { KnowledgeCollectionModule } from '../knowledge-collection/knowledge-collection.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KnowledgeFile.name, schema: KnowledgeFileSchema },
    ]),
    // Store file in memory buffer — service writes to disk
    MulterModule.register({ storage: memoryStorage() }),
    KnowledgeSharedModule,
    KnowledgeCollectionModule,
  ],
  controllers: [KnowledgeFileController],
  providers: [KnowledgeFileService],
  exports: [KnowledgeFileService, MongooseModule],
})
export class KnowledgeFileModule {}
