import { DynamicModule, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Conversation, ConversationSchema } from './conversation.schema';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { UtilModule } from '../util/util.module';
import { Action, ActionSchema } from '../action/action.schema';

const MONGOOSE_IMPORTS = MongooseModule.forFeature([
  { name: Conversation.name, schema: ConversationSchema },
  { name: Action.name, schema: ActionSchema },
]);

@Module({
  imports: [MONGOOSE_IMPORTS, UtilModule],
  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {
  /** Service-only: no controllers, no UtilModule (AI summary not needed in WS context) */
  static forService(): DynamicModule {
    return {
      module: ConversationModule,
      imports: [MONGOOSE_IMPORTS],
      providers: [ConversationService],
      exports: [ConversationService],
    };
  }
}
