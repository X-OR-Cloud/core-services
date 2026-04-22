import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Task, TaskSchema } from '../tasks/tasks.schema';
import { PlansModule } from '../plans/plans.module';
import { UserPlansModule } from '../user-plans/user-plans.module';
import { DailyUsagesModule } from '../daily-usages/daily-usages.module';
import { QuotaService } from './quota.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
    PlansModule,
    UserPlansModule,
    DailyUsagesModule,
  ],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
