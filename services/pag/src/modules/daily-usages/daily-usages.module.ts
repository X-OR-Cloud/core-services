import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DailyUsage, DailyUsageSchema } from './daily-usages.schema';
import { DailyUsagesService } from './daily-usages.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: DailyUsage.name, schema: DailyUsageSchema }])],
  providers: [DailyUsagesService],
  exports: [DailyUsagesService],
})
export class DailyUsagesModule {}
