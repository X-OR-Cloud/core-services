import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { Account, AccountSchema } from './account.schema';
import { NotificationService } from '../../shared/notification.service';
import { QUEUE_NAMES } from '../../config/queue.config';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Account.name, schema: AccountSchema }]),
    BullModule.registerQueue({ name: QUEUE_NAMES.SIGNAL_SCHEDULER }),
  ],
  controllers: [AccountController],
  providers: [AccountService, NotificationService],
  exports: [AccountService, NotificationService, MongooseModule],
})
export class AccountModule {}
