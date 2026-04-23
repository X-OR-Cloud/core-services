import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { InboundProcessor } from './processors/inbound.processor';
import { MemoryProcessor } from './processors/memory.processor';
import { HeartbeatProcessor } from './processors/heartbeat.processor';
import { TokenRefreshProcessor } from './processors/token-refresh.processor';
import { TaskProcessor } from './processors/task.processor';
import { PlanLifecycleProcessor } from './processors/plan-lifecycle.processor';
import { MemoryProducer } from './producers/memory.producer';
import { TaskProducer } from './producers/task.producer';

// Import entity modules
import { SoulsModule } from '../modules/souls/souls.module';
import { ConversationsModule } from '../modules/conversations/conversations.module';
import { MessagesModule } from '../modules/messages/messages.module';
import { MemoriesModule } from '../modules/memories/memories.module';
import { ChannelsModule } from '../modules/channels/channels.module';
import { TasksModule } from '../modules/tasks/tasks.module';
import { QuotaModule } from '../modules/quota/quota.module';
import { UserPlansModule } from '../modules/user-plans/user-plans.module';
import { PlansModule } from '../modules/plans/plans.module';
import { Conversation, ConversationSchema } from '../modules/conversations/conversations.schema';
import { Channel, ChannelSchema } from '../modules/channels/channels.schema';

// Import queue config
import { QUEUE_NAMES, QUEUE_EVENTS } from '../config/queue.config';

@Module({
  imports: [
    // Register queues for processors
    BullModule.registerQueue(
      { name: QUEUE_NAMES.INBOUND },
      { name: QUEUE_NAMES.HEARTBEAT },
      { name: QUEUE_NAMES.MEMORY_EXTRACT },
      { name: QUEUE_NAMES.TOKEN_REFRESH },
      { name: QUEUE_NAMES.TASKS },
      { name: QUEUE_NAMES.PLAN_LIFECYCLE },
    ),
    // Models needed by PlanLifecycleProcessor
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Channel.name, schema: ChannelSchema },
    ]),
    // Import entity modules for services
    SoulsModule,
    ConversationsModule,
    MessagesModule,
    MemoriesModule,
    ChannelsModule,
    TasksModule,
    QuotaModule,
    UserPlansModule,
    PlansModule,
  ],
  providers: [
    InboundProcessor,
    MemoryProcessor,
    HeartbeatProcessor,
    TokenRefreshProcessor,
    TaskProcessor,
    PlanLifecycleProcessor,
    MemoryProducer,
    TaskProducer,
  ],
})
export class ProcessorsModule implements OnModuleInit {
  private readonly logger = new Logger(ProcessorsModule.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.TOKEN_REFRESH) private tokenRefreshQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PLAN_LIFECYCLE) private planLifecycleQueue: Queue,
  ) {}

  async onModuleInit() {
    // Schedule token refresh every 30 minutes
    const tokenJobName = 'scheduled-token-refresh';
    const existingToken = await this.tokenRefreshQueue.getRepeatableJobs();
    for (const job of existingToken) {
      await this.tokenRefreshQueue.removeRepeatableByKey(job.key);
    }
    await this.tokenRefreshQueue.add(tokenJobName, { triggeredAt: new Date().toISOString() }, {
      repeat: { every: 30 * 60 * 1000 },
      removeOnComplete: 5,
      removeOnFail: 5,
    });
    this.logger.log('Token refresh scheduled: every 30 minutes');

    // Schedule plan lifecycle check daily at 7h GMT+7 (= 0h UTC)
    const planJobName = 'scheduled-plan-lifecycle';
    const existingPlan = await this.planLifecycleQueue.getRepeatableJobs();
    for (const job of existingPlan) {
      await this.planLifecycleQueue.removeRepeatableByKey(job.key);
    }
    await this.planLifecycleQueue.add(planJobName, { triggeredAt: new Date().toISOString() }, {
      repeat: { cron: '0 0 * * *' }, // every day at 0h UTC = 7h GMT+7
      removeOnComplete: 3,
      removeOnFail: 3,
    });
    this.logger.log('Plan lifecycle check scheduled: daily at 7h GMT+7');
  }
}