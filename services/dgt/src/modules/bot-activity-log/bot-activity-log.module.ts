import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BotActivityLogService } from './bot-activity-log.service';
import { BotActivityLogController } from './bot-activity-log.controller';
import { BotActivityLog, BotActivityLogSchema } from './bot-activity-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BotActivityLog.name, schema: BotActivityLogSchema },
    ]),
  ],
  controllers: [BotActivityLogController],
  providers: [BotActivityLogService],
  exports: [BotActivityLogService, MongooseModule],
})
export class BotActivityLogModule {}
