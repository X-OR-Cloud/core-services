import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Agent, AgentSchema } from '../agent/agent.schema';
import { ConversationModule } from '../conversation/conversation.module';
import { ActionModule } from '../action/action.module';
import { ChatDispatchService } from './chat-dispatch.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Agent.name, schema: AgentSchema }]),
    ConversationModule,
    ActionModule,
  ],
  providers: [ChatDispatchService],
  exports: [ChatDispatchService],
})
export class ChatDispatchModule {}
