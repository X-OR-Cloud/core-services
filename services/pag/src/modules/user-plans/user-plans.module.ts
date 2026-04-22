import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserPlan, UserPlanSchema } from './user-plans.schema';
import { UserPlansService } from './user-plans.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: UserPlan.name, schema: UserPlanSchema }])],
  providers: [UserPlansService],
  exports: [UserPlansService],
})
export class UserPlansModule {}
