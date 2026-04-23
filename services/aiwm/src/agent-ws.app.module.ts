import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { COMMON_CONFIG, SERVICE_CONFIG, buildMongoUri } from '@hydrabyte/shared';
import { AgentGatewayModule } from './modules/agent-gateway/agent-gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      buildMongoUri(`${COMMON_CONFIG.DatabaseNamePrefix}${SERVICE_CONFIG.aiwm.name}`),
    ),
    AgentGatewayModule,
  ],
})
export class AgentWsAppModule {}
