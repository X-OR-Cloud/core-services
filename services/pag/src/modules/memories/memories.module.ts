import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Memory, MemorySchema } from './memories.schema';
import { MemoriesService } from './memories.service';
import { MemoriesController } from './memories.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Memory.name, schema: MemorySchema }])
  ],
  controllers: [MemoriesController],
  providers: [MemoriesService],
  exports: [MemoriesService]
})
export class MemoriesModule {}