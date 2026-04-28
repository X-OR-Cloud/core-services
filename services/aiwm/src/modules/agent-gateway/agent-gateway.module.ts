import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { COMMON_CONFIG, SERVICE_CONFIG, buildMongoUri } from '@hydrabyte/shared';
import { AgentGateway } from './agent.gateway';
import { PresenceModule } from '../presence/presence.module';
import { HeartbeatModule } from '../heartbeat/heartbeat.module';
import { Agent, AgentSchema } from '../agent/agent.schema';
import { Conversation, ConversationSchema } from '../conversation/conversation.schema';
import { Action, ActionSchema } from '../action/action.schema';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      buildMongoUri(`${COMMON_CONFIG.DatabaseNamePrefix}${SERVICE_CONFIG.aiwm.name}`),
    ),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET environment variable is required for WebSocket authentication');
        }
        return { secret, signOptions: { expiresIn: '1h' } };
      },
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: Agent.name, schema: AgentSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Action.name, schema: ActionSchema },
    ]),
    PresenceModule,
    HeartbeatModule,
  ],
  providers: [AgentGateway],
})
export class AgentGatewayModule {}
