import { DynamicModule, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Action, ActionSchema } from './action.schema';
import { ActionService } from './action.service';
import { ActionController } from './action.controller';
import { ConversationModule } from '../conversation/conversation.module';

const MONGOOSE_IMPORTS = MongooseModule.forFeature([{ name: Action.name, schema: ActionSchema }]);

@Module({
  imports: [MONGOOSE_IMPORTS, ConversationModule],
  controllers: [ActionController],
  providers: [ActionService],
  exports: [ActionService],
})
export class ActionModule {
  /** Service-only: no controllers */
  static forService(): DynamicModule {
    return {
      module: ActionModule,
      imports: [MONGOOSE_IMPORTS, ConversationModule.forService()],
      providers: [ActionService],
      exports: [ActionService],
    };
  }
}
