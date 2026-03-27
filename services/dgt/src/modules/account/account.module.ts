import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { Account, AccountSchema } from './account.schema';
import { NotificationService } from '../../shared/notification.service';
import { RedisClientProvider } from '../../shared/redis.provider';
import { QUEUE_NAMES } from '../../config/queue.config';
import { ExchangeModule } from '../../exchange/exchange.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Account.name, schema: AccountSchema }]),
    BullModule.registerQueue({ name: QUEUE_NAMES.SIGNAL_SCHEDULER }),
    ExchangeModule,
  ],
  controllers: [AccountController],
  providers: [AccountService, NotificationService, RedisClientProvider],
  exports: [AccountService, NotificationService, MongooseModule],
})
export class AccountModule {}
