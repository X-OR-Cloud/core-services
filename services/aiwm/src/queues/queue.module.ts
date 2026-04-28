import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from '../config/queue.config';
import { NodeProducer } from './producers/node.producer';
import { ModelProducer } from './producers/model.producer';
import { DeploymentProducer } from './producers/deployment.producer';
import { AgentProducer } from './producers/agent.producer';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST') || 'localhost',
          port: configService.get<number>('REDIS_PORT') || 6379,
          username: configService.get<string>('REDIS_USERNAME') || undefined,
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
          db: configService.get<number>('REDIS_DB') || 0,
          enableReadyCheck: false,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.NODES },
      { name: QUEUE_NAMES.MODELS },
      { name: QUEUE_NAMES.DEPLOYMENTS },
      { name: QUEUE_NAMES.AGENTS }
    ),
  ],
  providers: [
    NodeProducer,
    ModelProducer,
    DeploymentProducer,
    AgentProducer,
  ],
  exports: [
    NodeProducer,
    ModelProducer,
    DeploymentProducer,
    AgentProducer,
    BullModule,
  ],
})
export class QueueModule {}
