import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Plan, PlanDocument } from './plans.schema';

const PLAN_SEED_DATA: Omit<Plan, keyof Document>[] = [
  {
    slug: 'mortal',
    name: 'Mortal',
    dailyMessageLimit: 30,
    maxActiveTasks: 5,
    allowRecurringTasks: false,
    maxNotes: 10,
    maxNoteLength: 2000,
    memoryRetentionDays: 90,
    memoryContextLimit: 10,
  },
  {
    slug: 'immortal',
    name: 'Immortal',
    dailyMessageLimit: 200,
    maxActiveTasks: 30,
    allowRecurringTasks: true,
    maxNotes: 100,
    maxNoteLength: 10000,
    memoryRetentionDays: 365,
    memoryContextLimit: 30,
  },
  {
    slug: 'god',
    name: 'God',
    dailyMessageLimit: null,
    maxActiveTasks: null,
    allowRecurringTasks: true,
    maxNotes: null,
    maxNoteLength: null,
    memoryRetentionDays: null,
    memoryContextLimit: null,
  },
];

@Injectable()
export class PlansService implements OnModuleInit {
  private readonly logger = new Logger(PlansService.name);

  constructor(@InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>) {}

  async onModuleInit() {
    await this.seedPlans();
  }

  private async seedPlans() {
    for (const data of PLAN_SEED_DATA) {
      await this.planModel.findOneAndUpdate(
        { slug: data.slug },
        { $setOnInsert: data },
        { upsert: true, new: true },
      );
    }
    this.logger.log('Plans seeded (mortal, immortal, god)');
  }

  async findBySlug(slug: string): Promise<PlanDocument | null> {
    return this.planModel.findOne({ slug }).exec();
  }

  async findAll(): Promise<PlanDocument[]> {
    return this.planModel.find().exec();
  }
}
