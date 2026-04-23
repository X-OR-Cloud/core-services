import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Conversation, ConversationSchema } from '../conversations/conversations.schema';
import { Channel, ChannelSchema } from '../channels/channels.schema';
import { Memory, MemorySchema } from '../memories/memories.schema';
import { Task, TaskSchema } from '../tasks/tasks.schema';
import { UserPlansModule } from '../user-plans/user-plans.module';
import { QuotaModule } from '../quota/quota.module';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Channel.name, schema: ChannelSchema },
      { name: Memory.name, schema: MemorySchema },
      { name: Task.name, schema: TaskSchema },
    ]),
    UserPlansModule,
    QuotaModule,
  ],
  providers: [StatsService],
  controllers: [StatsController],
})
export class StatsModule {}
