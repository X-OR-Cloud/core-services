import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { PresenceModule } from '../presence/presence.module';
import { ConversationModule } from '../conversation/conversation.module';
import { AgentModule } from '../agent/agent.module';
import { ActionModule } from '../action/action.module';
import { Conversation, ConversationSchema } from '../conversation/conversation.schema';
import { Action, ActionSchema } from '../action/action.schema';
import { Connection, ConnectionSchema } from '../connection/connection.schema';

@Module({
  imports: [
    PresenceModule,
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Action.name, schema: ActionSchema },
      { name: Connection.name, schema: ConnectionSchema },
    ]),
    ConversationModule,
    AgentModule,
    ActionModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
