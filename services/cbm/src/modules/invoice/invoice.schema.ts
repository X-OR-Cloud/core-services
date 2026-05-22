import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { MoneyAmount } from '../../shared-types/money.types';

export { MoneyAmount };

export type InvoiceDocument = Invoice & MongooseDocument;

export interface InvoiceItem {
  description: string;
  qty: number;
  price: MoneyAmount;
  amount: MoneyAmount; // = qty × price.value (same currency)
}

export interface EInvoiceLink {
  provider: string;   // e.g. 'VNPT', 'MISA', 'VIETTEL'
  eInvoiceId: string;
  fileUrl?: string;   // PDF/XML download URL
  rawData?: Record<string, any>; // raw response from provider
  linkedAt: Date;
}

/**
 * Invoice - Outbound invoice for billing customers
 * Uses MongoDB _id as the primary identifier
 * State machine added in Phase 3: draft → sent → partial/paid/overdue/cancelled
 */
@Schema({ timestamps: true, collection: 'invoices' })
export class Invoice extends BaseSchema {
  @Prop({ required: true, maxlength: 50 })
  code!: string; // auto-gen in Phase 3: INV-{YYYY}-{seq:04d}

  @Prop({ required: true })
  contactId!: string; // ref: Contact

  @Prop({ type: String })
  companyId?: string; // ref: Company (optional)

  @Prop({
    type: [
      {
        _id: false,
        description: { type: String, required: true },
        qty: { type: Number, required: true },
        price: { type: Object, required: true },
        amount: { type: Object, required: true },
      },
    ],
    default: [],
  })
  items!: InvoiceItem[];

  @Prop({ required: true, type: Object })
  subtotal!: MoneyAmount;

  @Prop({ type: Object })
  tax?: MoneyAmount;

  @Prop({ required: true, type: Object })
  totalAmount!: MoneyAmount;

  @Prop({
    required: true,
    enum: ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'],
    default: 'draft',
  })
  status!: string;

  @Prop({ required: true, type: Date })
  issuedDate!: Date;

  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ maxlength: 2000 })
  notes?: string;

  @Prop({ type: Object })
  eInvoice?: EInvoiceLink; // link to e-invoice provider (Phase 3)

  @Prop({ type: String })
  contractId?: string; // ref: Contract (optional)

  @Prop({ type: String })
  contractAnnexId?: string; // ref: ContractAnnex (optional)

  // Booking integration fields
  @Prop({ type: String })
  orderId?: string; // ref: Order (linked booking)

  @Prop({ type: String })
  shareToken?: string; // UUID token for public share link (72h TTL)

  @Prop({ type: Date })
  shareTokenExpiresAt?: Date; // expiry for share link

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

// Indexes for performance
InvoiceSchema.index({ code: 1, 'owner.orgId': 1 }, { unique: true });
InvoiceSchema.index({ contactId: 1 });
InvoiceSchema.index({ companyId: 1 });
InvoiceSchema.index({ status: 1 });
InvoiceSchema.index({ dueDate: 1, status: 1 }); // for overdue detection
InvoiceSchema.index({ issuedDate: -1 });
InvoiceSchema.index({ 'owner.orgId': 1 });
InvoiceSchema.index({ createdAt: -1 });
InvoiceSchema.index({ contractId: 1 });
InvoiceSchema.index({ contractAnnexId: 1 });
InvoiceSchema.index({ code: 'text', notes: 'text' }); // Full-text search
InvoiceSchema.index({ shareToken: 1 }, { sparse: true });
InvoiceSchema.index({ orderId: 1 });
