import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { MoneyAmount } from '../invoice/invoice.schema';

export type PaymentDocument = Payment & MongooseDocument;

export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'failed';

export interface GatewayData {
  provider: string;       // 'payos' | 'vnpay' | ...
  orderCode: number;      // numeric ID used for webhook lookup (PayOS orderCode)
  linkId: string;         // PayOS paymentLinkId
  qrCode: string;         // raw QR string
  checkoutUrl: string;    // checkout page URL
}

export interface ReconciliationData {
  needed: boolean;
  reason?: string;        // 'expired_qr' | 'duplicate' | 'manual'
  note?: string;          // ops note when resolving
  resolvedAt?: Date;
  resolvedBy?: string;
}

/**
 * Payment — records a payment received against an Invoice.
 * Immutable after creation — void via soft delete.
 *
 * Pending payments (status: 'pending'):
 * - Created when user initiates a gateway payment (PayOS VietQR)
 * - invoiceId is optional — Invoice auto-created when payment confirmed
 * - Transaction only auto-created when status transitions to 'paid'
 *
 * Legacy payments (no status field): treated as 'paid' — backward compatible.
 */
@Schema({ timestamps: true, collection: 'payments' })
export class Payment extends BaseSchema {
  @Prop()
  invoiceId?: string; // ref: Invoice — optional for pending gateway payments

  @Prop({ required: true, type: Object })
  amount!: MoneyAmount;

  @Prop({ type: Date })
  date?: Date; // payment confirmed date — set when status → paid

  @Prop({ enum: ['cash', 'bank_transfer', 'card', 'e_wallet', 'other', 'gateway'] })
  method?: string;

  @Prop({ maxlength: 500 })
  note?: string;

  @Prop({ maxlength: 100 })
  reference?: string; // bank transfer ref / receipt number

  @Prop({ type: String })
  transactionId?: string; // set after Transaction is created

  // ── Gateway / Pending payment fields ──────────────────────────────────────

  @Prop({ enum: ['pending', 'paid', 'expired', 'failed'] })
  status?: PaymentStatus;
  // undefined = legacy payment without status → treated as 'paid'

  @Prop({ type: Date })
  expiredAt?: Date; // QR link expiry — only for pending payments

  @Prop({ type: Object })
  gatewayData?: GatewayData;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
  // Example: { platformUserId, platformType, planSlug, planName, planAmount, serviceId }

  @Prop({ type: Object })
  reconciliation?: ReconciliationData;

  // ── Outbound webhook (caller-supplied) ────────────────────────────────────

  @Prop({ maxlength: 500 })
  webhookUrl?: string; // URL CBM calls back on payment confirmed

  @Prop({ maxlength: 200 })
  webhookSecret?: string; // HMAC-SHA256 shared secret for X-Signature header
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ invoiceId: 1 });
PaymentSchema.index({ date: -1 });
PaymentSchema.index({ method: 1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ 'owner.orgId': 1 });
PaymentSchema.index({ createdAt: -1 });
PaymentSchema.index({ 'gatewayData.orderCode': 1 }); // for webhook lookup
PaymentSchema.index({ expiredAt: 1, status: 1 });    // for cron expiry job
