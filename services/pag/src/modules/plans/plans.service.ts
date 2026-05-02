import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Plan, PlanDocument } from './plans.schema';

const PLAN_SEED_DATA = [
  {
    slug: 'mortal',
    name: 'Mortal',
    description: 'Gói miễn phí — đủ dùng mỗi ngày',
    price: 0,
    isActive: true,
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
    description: 'Không giới hạn task, nhắc nhở lặp lại',
    price: 99000,
    isActive: true,
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
    description: 'Toàn bộ tính năng, không giới hạn',
    price: 299000,
    isActive: true,
    dailyMessageLimit: null,
    maxActiveTasks: null,
    allowRecurringTasks: true,
    maxNotes: null,
    maxNoteLength: null,
    memoryRetentionDays: null,
    memoryContextLimit: null,
  },
];

// Emoji per plan slug
const PLAN_EMOJI: Record<string, string> = {
  mortal: '🆓',
  immortal: '⚡',
  god: '🔥',
};

export interface UpdatePlanDto {
  name?: string;
  description?: string;
  price?: number;
  isActive?: boolean;
  dailyMessageLimit?: number | null;
  maxActiveTasks?: number | null;
  allowRecurringTasks?: boolean;
  maxNotes?: number | null;
  maxNoteLength?: number | null;
  memoryRetentionDays?: number | null;
  memoryContextLimit?: number | null;
}

@Injectable()
export class PlansService implements OnModuleInit {
  private readonly logger = new Logger(PlansService.name);

  constructor(@InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>) {}

  async onModuleInit() {
    await this.seedPlans();
  }

  private async seedPlans() {
    for (const data of PLAN_SEED_DATA) {
      // $setOnInsert: only creates if not exists — admin changes via API are preserved on restart
      // $set for new fields (description/price/isActive) that may not exist in old docs
      await this.planModel.findOneAndUpdate(
        { slug: data.slug },
        {
          $setOnInsert: {
            slug: data.slug,
            name: data.name,
            dailyMessageLimit: data.dailyMessageLimit,
            maxActiveTasks: data.maxActiveTasks,
            allowRecurringTasks: data.allowRecurringTasks,
            maxNotes: data.maxNotes,
            maxNoteLength: data.maxNoteLength,
            memoryRetentionDays: data.memoryRetentionDays,
            memoryContextLimit: data.memoryContextLimit,
          },
          // Migrate new fields if they don't exist yet
          $set: {
            ...(data.description !== undefined ? { description: data.description } : {}),
            ...(data.price !== undefined ? { price: data.price } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          },
        },
        { upsert: true, new: true },
      );
    }
    this.logger.log('Plans seeded (mortal, immortal, god)');
  }

  async findBySlug(slug: string): Promise<PlanDocument | null> {
    return this.planModel.findOne({ slug }).exec();
  }

  async findAll(): Promise<PlanDocument[]> {
    return this.planModel.find().sort({ price: 1 }).exec();
  }

  async findActive(): Promise<PlanDocument[]> {
    return this.planModel.find({ isActive: true }).sort({ price: 1 }).exec();
  }

  async update(slug: string, dto: UpdatePlanDto): Promise<PlanDocument | null> {
    return this.planModel.findOneAndUpdate(
      { slug },
      { $set: dto },
      { new: true },
    ).exec();
  }

  /**
   * Build a human-readable plans display string for quick command responses.
   * Reads active plans from DB so admin changes are reflected immediately.
   */
  async getPlansDisplay(): Promise<string> {
    const plans = await this.findActive();
    if (!plans.length) return '📦 Hiện không có gói dịch vụ nào.';

    const lines = ['📦 Các gói dịch vụ:\n'];
    for (const plan of plans) {
      const emoji = PLAN_EMOJI[plan.slug] || '📦';
      const priceStr = plan.price === 0 ? 'Miễn phí' : `${plan.price.toLocaleString('vi-VN')}đ/tháng`;
      lines.push(`${emoji} ${plan.name} — ${priceStr}`);
      if (plan.description) lines.push(`   ${plan.description}`);

      const bullets: string[] = [];
      if (plan.dailyMessageLimit === null) {
        bullets.push('• Tin nhắn: không giới hạn');
      } else {
        bullets.push(`• ${plan.dailyMessageLimit} tin nhắn/ngày`);
      }
      if (plan.maxActiveTasks === null) {
        bullets.push('• Task: không giới hạn');
      } else {
        bullets.push(`• ${plan.maxActiveTasks} task đang chờ`);
      }
      if (plan.allowRecurringTasks) bullets.push('• Nhắc nhở lặp lại ✓');
      if (plan.memoryRetentionDays === null) {
        bullets.push('• Ký ức vĩnh viễn');
      } else {
        bullets.push(`• Lưu ${plan.memoryRetentionDays} ngày ký ức`);
      }
      lines.push(bullets.join('\n'));
      lines.push('');
    }

    lines.push('Liên hệ để nâng cấp hoặc hỏi thêm thông tin nhé!');
    return lines.join('\n');
  }
}
