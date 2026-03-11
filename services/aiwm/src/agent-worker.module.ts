import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { COMMON_CONFIG, SERVICE_CONFIG } from '@hydrabyte/shared';
import { AgentWorkerModule as AgentWorkerFeatureModule } from './modules/agent-worker/agent-worker.module';

/**
 * Agent Worker Module (agt mode)
 * - No HTTP controllers or WebSocket gateways
 * - Loads hosted agents from DB, spawns AgentRunners
 * - Each runner connects to /ws/chat and processes messages via Vercel AI SDK + MCP
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    MongooseModule.forRoot(
      `${process.env.MONGODB_URI}/${COMMON_CONFIG.DatabaseNamePrefix}${SERVICE_CONFIG.aiwm.name}`,
    ),

    HttpModule,

    AgentWorkerFeatureModule,
  ],
})
export class AgentWorkerModule {}
