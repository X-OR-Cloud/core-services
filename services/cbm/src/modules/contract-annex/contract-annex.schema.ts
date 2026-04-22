import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { EInvoiceLink, MoneyAmount } from '../invoice/invoice.schema';

export type ContractAnnexDocument = ContractAnnex & MongooseDocument;

export type ContractAnnexStatus = 'draft' | 'active' | 'cancelled';
export const CONTRACT_ANNEX_STATUSES: ContractAnnexStatus[] = ['draft', 'active', 'cancelled'];

// ========== ServiceItem Unit ==========

export enum UnitCode {
  MONTH = 'month',
  HOUR = 'hour',
  DAY = 'day',
  YEAR = 'year',
  LICENSE = 'license',
  TIME = 'time',       // lần
  ITEM = 'item',
  PACKAGE = 'package',
  OTHER = 'other',
}

export interface ServiceItemUnit {
  id?: string;    // external unit ID (e.g. from eInvoice provider); default ''
  code?: string;  // UnitCode enum value
  name?: string;  // display name (e.g. 'Tháng', 'Giờ', 'Gói')
}

export const UNIT_OPTIONS: Required<ServiceItemUnit>[] = [
  { id: '', code: UnitCode.MONTH, name: 'Tháng' },
  { id: '', code: UnitCode.HOUR, name: 'Giờ' },
  { id: '', code: UnitCode.DAY, name: 'Ngày' },
  { id: '', code: UnitCode.YEAR, name: 'Năm' },
  { id: '', code: UnitCode.LICENSE, name: 'License' },
  { id: '', code: UnitCode.TIME, name: 'Lần' },
  { id: '', code: UnitCode.ITEM, name: 'Cái' },
  { id: '', code: UnitCode.PACKAGE, name: 'Gói' },
  { id: '', code: UnitCode.OTHER, name: 'Khác' },
];

// ========== ServiceItem ==========

export interface ServiceItem {
  name: string;
  description?: string;
  qty: number;
  unit: ServiceItemUnit;
  unitPrice: MoneyAmount;
  amount: MoneyAmount; // = qty × unitPrice.value (same currency)
}

/**
 * ContractAnnex — Appendix attached to a Contract.
 * Each annex details specific service items, quantities and pricing.
 * State machine: draft → active → cancelled
 * Code auto-generated: PL01, PL02, ... per contract
 */
@Schema({ timestamps: true })
export class ContractAnnex extends BaseSchema {
  @Prop({ required: true })
  contractId!: string; // ref: Contract

  @Prop({ required: true, maxlength: 20 })
  code!: string; // auto-gen: PL01, PL02, ... per contract

  @Prop({ required: true, maxlength: 500 })
  title!: string;

  @Prop({ maxlength: 5000 })
  description?: string;

  @Prop({
    required: true,
    enum: CONTRACT_ANNEX_STATUSES,
    default: 'draft',
  })
  status!: string;

  @Prop({
    type: [
      {
        _id: false,
        name: { type: String, required: true },
        description: { type: String },
        qty: { type: Number, required: true },
        unit: {
          type: {
            id: { type: String, default: '' },
            code: { type: String },
            name: { type: String },
          },
          _id: false,
        },
        unitPrice: { type: Object, required: true },
        amount: { type: Object, required: true },
      },
    ],
    default: [],
  })
  serviceItems!: ServiceItem[];

  @Prop({ type: Object })
  subtotal?: MoneyAmount;

  @Prop({ type: Object })
  eInvoice?: EInvoiceLink; // link to issued e-invoice

  @Prop({ type: Object })
  eInvoiceRawData?: Record<string, any>; // raw response from eInvoice provider

  @Prop({ maxlength: 2000 })
  notes?: string;

  // BaseSchema provides: owner (orgId), createdBy, updatedBy, deletedAt, metadata, timestamps
}

export const ContractAnnexSchema = SchemaFactory.createForClass(ContractAnnex);

// Indexes
ContractAnnexSchema.index({ contractId: 1, code: 1 }, { unique: true });
ContractAnnexSchema.index({ contractId: 1 });
ContractAnnexSchema.index({ status: 1 });
ContractAnnexSchema.index({ 'owner.orgId': 1 });
ContractAnnexSchema.index({ createdAt: -1 });
ContractAnnexSchema.index({ code: 'text', title: 'text', notes: 'text' });
