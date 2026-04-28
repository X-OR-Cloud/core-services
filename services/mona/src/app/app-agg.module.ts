import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { COMMON_CONFIG, SERVICE_CONFIG, buildMongoUri } from '@hydrabyte/shared';
import { redisConfig } from '../config/redis.config';
import { ProcessorsModule } from '../queues/processors.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      buildMongoUri(`${COMMON_CONFIG.DatabaseNamePrefix}${SERVICE_CONFIG.mona.name}`),
    ),
    BullModule.forRoot({ connection: redisConfig }),
    ProcessorsModule,
  ],
})
export class AppAggModule {}
