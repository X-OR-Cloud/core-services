import { Module } from '@nestjs/common';
import { ConnectionWorkerService } from './connection-worker.service';
import { RoutingService } from './routing.service';
import { ConnectionModule } from '../connection/connection.module';
import { ActionModule } from '../action/action.module';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [
    ConnectionModule,
    ActionModule,
    ConversationModule,
  ],
  providers: [ConnectionWorkerService, RoutingService],
  exports: [ConnectionWorkerService],
})
export class ConnectionWorkerModule {}
