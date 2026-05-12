import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { ThrottlerModule } from '@nestjs/throttler';
import { COMMON_CONFIG, SERVICE_CONFIG, buildMongoUri } from '@hydrabyte/shared';
import { FileModule } from '../file/file.module';
import { ChatWsGateway } from './chat.gateway';
import { ChatService } from '../chat/chat.service';
import { PresenceModule } from '../presence/presence.module';
import { HeartbeatModule } from '../heartbeat/heartbeat.module';
import { ConversationService } from '../conversation/conversation.service';
import { ActionService } from '../action/action.service';
import { UtilService } from '../util/util.service';
import { ConfigurationService } from '../configuration/configuration.service';
import { ConfigService as AppConfigService } from '../configuration/config.service';
import { IamOrgService } from '../configuration/iam-org.service';
import { Agent, AgentSchema } from '../agent/agent.schema';
import { Conversation, ConversationSchema } from '../conversation/conversation.schema';
import { Action, ActionSchema } from '../action/action.schema';
import { Connection, ConnectionSchema } from '../connection/connection.schema';
import { Configuration, ConfigurationSchema } from '../configuration/configuration.schema';

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
      { name: Connection.name, schema: ConnectionSchema },
      { name: Configuration.name, schema: ConfigurationSchema },
    ]),
    HttpModule.register({ timeout: 30000, maxRedirects: 5 }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
    FileModule,
    PresenceModule,
    HeartbeatModule,
  ],
  providers: [
    ChatWsGateway,
    ChatService,
    ConversationService,
    ActionService,
    UtilService,
    ConfigurationService,
    AppConfigService,
    IamOrgService,
  ],
})
export class ChatGatewayModule {}
