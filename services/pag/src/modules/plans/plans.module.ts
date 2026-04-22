import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Plan, PlanSchema } from './plans.schema';
import { PlansService } from './plans.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Plan.name, schema: PlanSchema }])],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
