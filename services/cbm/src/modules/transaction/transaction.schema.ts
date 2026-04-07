import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { MoneyAmount } from '../invoice/invoice.schema';

export type TransactionDocument = Transaction & MongooseDocument;

export interface TransactionSnapshot {
  description: string;       // human-readable summary
  contactName?: string;
  companyName?: string;
  invoiceCode?: string;      // populated for income transactions
  expenseCategory?: string;  // populated for expense transactions
}

/**
 * Transaction - Read-only auto-generated ledger record
 * Created automatically:
 *   - When a Payment is recorded → type: income
 *   - When an Expense is approved → type: expense
 * Never created or modified directly by API clients.
 * Uses MongoDB _id as the primary identifier
 */
@Schema({ timestamps: true })
export class Transaction extends BaseSchema {
  @Prop({ required: true, enum: ['income', 'expense'] })
  type!: string;

  @Prop({ required: true, type: Object })
  amount!: MoneyAmount;

  @Prop({ required: true, type: Date })
  date!: Date;

  @Prop({ required: true, enum: ['payment', 'expense'] })
  referenceType!: string;

  @Prop({ required: true })
  referenceId!: string; // ObjectId of Payment or Expense

  @Prop({ type: Object })
  snapshot?: TransactionSnapshot; // denormalized info at time of creation

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

// Indexes for performance
TransactionSchema.index({ referenceType: 1, referenceId: 1 }, { unique: true });
TransactionSchema.index({ type: 1 });
TransactionSchema.index({ date: -1 });
TransactionSchema.index({ 'owner.orgId': 1 });
TransactionSchema.index({ createdAt: -1 });
