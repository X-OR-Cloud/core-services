import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemActivityLogService } from './system-activity-log.service';
import { SystemActivityLogController } from './system-activity-log.controller';
import { SystemActivityLog, SystemActivityLogSchema } from './system-activity-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SystemActivityLog.name, schema: SystemActivityLogSchema },
    ]),
  ],
  controllers: [SystemActivityLogController],
  providers: [SystemActivityLogService],
  exports: [SystemActivityLogService, MongooseModule],
})
export class SystemActivityLogModule {}
