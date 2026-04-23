import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatGateway } from './chat.gateway';
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
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET environment variable is required for WebSocket authentication');
        }
        return { secret, signOptions: { expiresIn: '1h' } };
      },
      inject: [ConfigService],
    }),

    // Redis presence tracking — provided by PresenceModule
    PresenceModule,

    // Models for ChatService Monitor API (direct inject — bypasses service RBAC)
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
  providers: [ChatGateway, ChatService],
  exports: [ChatService],
})
export class ChatModule {}
