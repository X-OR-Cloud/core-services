import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Reminder, ReminderDocument } from './reminder.schema';
import { CreateReminderDto, UpdateReminderDto } from './reminder.dto';
import { RequestContext } from '@hydrabyte/shared';

@Injectable()
export class ReminderService {
  constructor(
    @InjectModel(Reminder.name) private readonly reminderModel: Model<ReminderDocument>,
  ) {}

  async create(dto: CreateReminderDto, agentId: string, context: RequestContext): Promise<Reminder> {
    const reminder = new this.reminderModel({
      agentId,
      content: dto.content,
      triggerAt: dto.triggerAt ? new Date(dto.triggerAt) : null,
      status: 'pending',
      owner: { orgId: context.orgId, agentId },
      createdBy: { agentId },
    });
    return reminder.save();
  }

  async findByAgent(agentId: string, status: 'pending' | 'done' | 'all' = 'pending'): Promise<{ total: number; reminders: Reminder[] }> {
    const filter: Record<string, any> = { agentId, isDeleted: { $ne: true } };
    if (status !== 'all') filter.status = status;

    const [reminders, total] = await Promise.all([
      this.reminderModel.find(filter).sort({ createdAt: 1 }).lean(),
      this.reminderModel.countDocuments(filter),
    ]);

    return { total, reminders };
  }

  async update(id: string, dto: UpdateReminderDto, agentId: string): Promise<Reminder> {
    const reminder = await this.reminderModel.findOne({ _id: id, agentId, isDeleted: { $ne: true } });
    if (!reminder) throw new NotFoundException('Reminder not found');

    if (dto.content !== undefined) reminder.content = dto.content;
    if (dto.triggerAt !== undefined) reminder.triggerAt = new Date(dto.triggerAt);

    return reminder.save();
  }

  async markDone(id: string, agentId: string): Promise<Reminder> {
    const reminder = await this.reminderModel.findOne({ _id: id, agentId, isDeleted: { $ne: true } });
    if (!reminder) throw new NotFoundException('Reminder not found');

    reminder.status = 'done';
    reminder.doneAt = new Date();
    return reminder.save();
  }

  async delete(id: string, agentId: string): Promise<void> {
    const result = await this.reminderModel.findOneAndUpdate(
      { _id: id, agentId, isDeleted: { $ne: true } },
      { isDeleted: true },
    );
    if (!result) throw new NotFoundException('Reminder not found');
  }

  async getPendingForHeartbeat(agentId: string): Promise<Reminder[]> {
    const now = new Date();
    return this.reminderModel.find({
      agentId,
      status: 'pending',
      isDeleted: { $ne: true },
      $or: [
        { triggerAt: null },
        { triggerAt: { $lte: now } },
      ],
    }).sort({ createdAt: 1 }).lean();
  }
}
