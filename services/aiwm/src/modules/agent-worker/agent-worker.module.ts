import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Agent, AgentSchema } from '../agent/agent.schema';
import { AgentModule } from '../agent/agent.module';
import { AgentWorkerService } from './agent-worker.service';
import { AgentLockService } from './agent-lock.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Agent.name, schema: AgentSchema }]),
    AgentModule,
  ],
  providers: [AgentLockService, AgentWorkerService],
})
export class AgentWorkerModule {}
