import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Conversation, ConversationSchema } from './conversation.schema';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { UtilModule } from '../util/util.module';
import { Action, ActionSchema } from '../action/action.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Action.name, schema: ActionSchema },
    ]),
    UtilModule,
  ],
  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
