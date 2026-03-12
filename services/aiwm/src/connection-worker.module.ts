import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { COMMON_CONFIG, SERVICE_CONFIG } from '@hydrabyte/shared';
import { ConnectionWorkerModule as ConnectionWorkerFeatureModule } from './modules/connection-worker/connection-worker.module';

/**
 * Connection Worker Module (con mode)
 * - No HTTP controllers or WebSocket gateways
 * - Loads active connections from DB, spawns ConnectionRunners
 * - Each runner connects to Discord/Telegram and bridges messages to AIWM pipeline
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

    ConnectionWorkerFeatureModule,
  ],
})
export class ConnectionWorkerModule {}
