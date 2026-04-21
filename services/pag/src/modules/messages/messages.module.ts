import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Message, MessageSchema } from './messages.schema';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { ChannelsModule } from '../channels/channels.module';
import { Conversation, ConversationSchema } from '../conversations/conversations.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: Conversation.name, schema: ConversationSchema },
    ]),
    ChannelsModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService]
})
export class MessagesModule {}