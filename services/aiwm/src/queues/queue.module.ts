import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { redisConfig } from '../config/redis.config';
import { QUEUE_NAMES } from '../config/queue.config';
import { NodeProducer } from './producers/node.producer';
import { ModelProducer } from './producers/model.producer';
import { DeploymentProducer } from './producers/deployment.producer';
import { AgentProducer } from './producers/agent.producer';

@Module({
  imports: [
    BullModule.forRoot({
      connection: redisConfig,
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
