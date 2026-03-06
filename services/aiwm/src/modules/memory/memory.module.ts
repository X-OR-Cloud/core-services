import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AgentMemory, AgentMemorySchema } from './memory.schema';
import { MemoryService } from './memory.service';
import { MemoryController } from './memory.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AgentMemory.name, schema: AgentMemorySchema },
    ]),
  ],
  controllers: [MemoryController],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
