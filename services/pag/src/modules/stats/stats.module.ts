import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Conversation, ConversationSchema } from '../conversations/conversations.schema';
import { Message, MessageSchema } from '../messages/messages.schema';
import { Channel, ChannelSchema } from '../channels/channels.schema';
import { Memory, MemorySchema } from '../memories/memories.schema';
import { Task, TaskSchema } from '../tasks/tasks.schema';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Channel.name, schema: ChannelSchema },
      { name: Memory.name, schema: MemorySchema },
      { name: Task.name, schema: TaskSchema },
    ]),
  ],
  providers: [StatsService],
  controllers: [StatsController],
})
export class StatsModule {}
