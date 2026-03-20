import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Agent, AgentSchema } from '../agent/agent.schema';
import { AgentModule } from '../agent/agent.module';
import { ActionModule } from '../action/action.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { FileModule } from '../file/file.module';
import { AgentWorkerService } from './agent-worker.service';
import { AgentLockService } from './agent-lock.service';
import { CbmKnowledgeService } from './cbm-knowledge.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Agent.name, schema: AgentSchema }]),
    AgentModule,
    ActionModule,
    ConfigurationModule,
    FileModule,
  ],
  providers: [AgentLockService, AgentWorkerService, CbmKnowledgeService],
})
export class AgentWorkerModule {}
