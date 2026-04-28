import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { redisConfig } from '../config/redis.config';
import { QUEUE_NAMES } from '../config/queue.config';
import { AmiModule } from '../ami/ami.module';

/**
 * AMI Bridge mode module — no HTTP server.
 * Connects to Asterisk AMI, handles events, consumes vsm:ami:commands queue.
 * Run with: MODE=ami nx run vsm:ami
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    BullModule.forRoot({ connection: redisConfig }),
    BullModule.registerQueue({ name: QUEUE_NAMES.AMI_COMMANDS }),
    AmiModule,
  ],
})
export class AppAmiModule {}
