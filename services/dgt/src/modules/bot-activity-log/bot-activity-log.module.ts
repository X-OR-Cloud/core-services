import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BotActivityLogService } from './bot-activity-log.service';
import { BotActivityLog, BotActivityLogSchema } from './bot-activity-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BotActivityLog.name, schema: BotActivityLogSchema },
    ]),
  ],
  providers: [BotActivityLogService],
  exports: [BotActivityLogService, MongooseModule],
})
export class BotActivityLogModule {}
