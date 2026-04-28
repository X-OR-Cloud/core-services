import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { MoneyAmount } from '../invoice/invoice.schema';

export type ExpenseDocument = Expense & MongooseDocument;

/**
 * Expense - Internal business expense record
 * Uses MongoDB _id as the primary identifier
 * State machine added in Phase 3: pending → approved/rejected → resubmit
 */
@Schema({ timestamps: true, collection: 'expenses' })
export class Expense extends BaseSchema {
  @Prop({
    required: true,
    enum: ['salary', 'rent', 'tools', 'travel', 'marketing', 'utilities', 'other'],
  })
  category!: string;

  @Prop({ required: true, type: Object })
  amount!: MoneyAmount;

  @Prop({ type: String })
  vendorId?: string; // ref: Contact or Company (optional)

  @Prop({ maxlength: 200 })
  vendorName?: string; // free-text fallback if no vendorId

  @Prop({ required: true, type: Date })
  date!: Date;

  @Prop({ required: true, maxlength: 1000 })
  description!: string;

  @Prop({
    required: true,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  })
  status!: string;

  @Prop({ maxlength: 500 })
  rejectionReason?: string; // set on rejection (Phase 3)

  @Prop({ maxlength: 500 })
  receiptUrl?: string; // uploaded receipt file URL

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ maxlength: 2000 })
  notes?: string;

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);

// Indexes for performance
ExpenseSchema.index({ status: 1 });
ExpenseSchema.index({ category: 1 });
ExpenseSchema.index({ date: -1 });
ExpenseSchema.index({ vendorId: 1 });
ExpenseSchema.index({ tags: 1 });
ExpenseSchema.index({ 'owner.orgId': 1 });
ExpenseSchema.index({ createdAt: -1 });
ExpenseSchema.index({ description: 'text', notes: 'text' }); // Full-text search
