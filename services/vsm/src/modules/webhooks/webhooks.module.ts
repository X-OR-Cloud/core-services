import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Account, AccountSchema } from '../accounts/accounts.schema';
import { AccountsModule } from '../accounts/accounts.module';
import { TrunksModule } from '../trunks/trunks.module';
import { DialplansModule } from '../dialplans/dialplans.module';
import { CallsModule } from '../calls/calls.module';
import { NodesModule } from '../nodes/nodes.module';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Account.name, schema: AccountSchema }]),
    AccountsModule,
    TrunksModule,
    DialplansModule,
    CallsModule,
    NodesModule,
  ],
  providers: [WebhooksService],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
