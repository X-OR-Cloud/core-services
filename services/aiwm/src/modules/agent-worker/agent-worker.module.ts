import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { Agent, AgentSchema } from '../agent/agent.schema';
import { AgentWorkerService } from './agent-worker.service';
import { AgentLockService } from './agent-lock.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Agent.name, schema: AgentSchema }]),
    HttpModule,
  ],
  providers: [AgentLockService, AgentWorkerService],
})
export class AgentWorkerModule {}
