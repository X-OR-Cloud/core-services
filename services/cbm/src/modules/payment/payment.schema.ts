import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { MoneyAmount } from '../invoice/invoice.schema';

export type PaymentDocument = Payment & MongooseDocument;

/**
 * Payment - A payment received against an Invoice
 * Immutable after creation — void via soft delete
 * Uses MongoDB _id as the primary identifier
 *
 * Phase 3: on create → update Invoice status + create Transaction (income)
 * Phase 3: on delete → reverse Invoice status + soft-delete Transaction
 */
@Schema({ timestamps: true, collection: 'payments' })
export class Payment extends BaseSchema {
  @Prop({ required: true })
  invoiceId!: string; // ref: Invoice

  @Prop({ required: true, type: Object })
  amount!: MoneyAmount;

  @Prop({ required: true, type: Date })
  date!: Date;

  @Prop({
    required: true,
    enum: ['cash', 'bank_transfer', 'card', 'e_wallet', 'other'],
  })
  method!: string;

  @Prop({ maxlength: 500 })
  note?: string;

  @Prop({ maxlength: 100 })
  reference?: string; // bank transfer ref / receipt number

  @Prop({ type: String })
  transactionId?: string; // set after Transaction is created (Phase 3)

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

// Indexes for performance
PaymentSchema.index({ invoiceId: 1 });
PaymentSchema.index({ date: -1 });
PaymentSchema.index({ method: 1 });
PaymentSchema.index({ 'owner.orgId': 1 });
PaymentSchema.index({ createdAt: -1 });
