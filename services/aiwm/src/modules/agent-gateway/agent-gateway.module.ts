import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisModule } from '@nestjs-modules/ioredis';
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

    RedisModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        type: 'single',
        url: configService.get<string>('REDIS_URL') || 'redis://localhost:6379',
        options: {
          enableReadyCheck: false,
          retryStrategy: (times: number) => Math.min(times * 50, 2000),
          maxRetriesPerRequest: 3,
        },
      }),
      inject: [ConfigService],
    }),

    ChatModule,
    ConversationModule,
    AgentModule,
    ActionModule,
  ],
  providers: [AgentGateway],
})
export class AgentGatewayModule {}
