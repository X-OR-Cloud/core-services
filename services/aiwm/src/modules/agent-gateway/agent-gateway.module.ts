import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AgentGateway } from './agent.gateway';
import { ChatModule } from '../chat/chat.module';
import { ConversationModule } from '../conversation/conversation.module';
import { AgentModule } from '../agent/agent.module';
import { ActionModule } from '../action/action.module';

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

    // ChatModule already registers RedisModule — no need to re-register here
    ChatModule,
    ConversationModule,
    AgentModule,
    ActionModule,
  ],
  providers: [AgentGateway],
})
export class AgentGatewayModule {}
