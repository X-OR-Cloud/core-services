import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DebugController } from './debug.controller';
import { DebugService } from './debug.service';
import { Agent, AgentSchema } from '../agent/agent.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Agent.name, schema: AgentSchema }]),
  ],
  controllers: [DebugController],
  providers: [DebugService],
})
export class DebugModule {}
