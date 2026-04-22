import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { EInvoiceLink } from '../invoice/invoice.schema';

export type ContractDocument = Contract & MongooseDocument;

export type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated' | 'cancelled';
export type ContractType = 'service' | 'maintenance' | 'support' | 'other';

export const CONTRACT_STATUSES: ContractStatus[] = ['draft', 'active', 'expired', 'terminated', 'cancelled'];
export const CONTRACT_TYPES: ContractType[] = ['service', 'maintenance', 'support', 'other'];

/**
 * Contract — Service contract between org and customer
 * State machine: draft → active → expired | terminated | cancelled
 * Code auto-generated: CTR-{YYYY}-{seq:04d} per org
 */
@Schema({ timestamps: true })
export class Contract extends BaseSchema {
  @Prop({ required: true, maxlength: 50 })
  code!: string; // auto-gen: CTR-{YYYY}-{seq:04d}

  @Prop({ required: true, maxlength: 500 })
  title!: string;

  @Prop({ required: true })
  contactId!: string; // ref: Contact

  @Prop({ type: String })
  companyId?: string; // ref: Company (optional)

  @Prop({
    required: true,
    enum: CONTRACT_TYPES,
    default: 'service',
  })
  type!: string;

  @Prop({ maxlength: 5000 })
  description?: string;

  @Prop({
    required: true,
    enum: CONTRACT_STATUSES,
    default: 'draft',
  })
  status!: string;

  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Date })
  endDate?: Date;

  @Prop({ type: Object })
  value?: { currency: string; value: number }; // contract total value

  @Prop({ type: Object })
  eInvoice?: EInvoiceLink; // link to issued e-invoice

  @Prop({ type: Object })
  eInvoiceRawData?: Record<string, any>; // raw response from eInvoice provider

  @Prop({ maxlength: 2000 })
  notes?: string;

  // BaseSchema provides: owner (orgId), createdBy, updatedBy, deletedAt, metadata, timestamps
}

export const ContractSchema = SchemaFactory.createForClass(Contract);

// Indexes
ContractSchema.index({ code: 1, 'owner.orgId': 1 }, { unique: true });
ContractSchema.index({ contactId: 1 });
ContractSchema.index({ companyId: 1 });
ContractSchema.index({ status: 1 });
ContractSchema.index({ type: 1 });
ContractSchema.index({ startDate: 1, endDate: 1 });
ContractSchema.index({ 'owner.orgId': 1 });
ContractSchema.index({ createdAt: -1 });
ContractSchema.index({ code: 'text', title: 'text', notes: 'text' });
