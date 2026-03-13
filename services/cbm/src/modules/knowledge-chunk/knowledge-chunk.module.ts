import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KnowledgeChunkController } from './knowledge-chunk.controller';
import { KnowledgeChunkService } from './knowledge-chunk.service';
import { KnowledgeChunk, KnowledgeChunkSchema } from './knowledge-chunk.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KnowledgeChunk.name, schema: KnowledgeChunkSchema },
    ]),
  ],
  controllers: [KnowledgeChunkController],
  providers: [KnowledgeChunkService],
  exports: [KnowledgeChunkService, MongooseModule],
})
export class KnowledgeChunkModule {}
