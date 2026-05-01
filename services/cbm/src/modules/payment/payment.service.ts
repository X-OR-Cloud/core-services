import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { WEBHOOK_OUTBOUND_QUEUE } from './webhook-outbound.processor';
import { Payment } from './payment.schema';
import { InvoiceService } from '../invoice/invoice.service';
import { TransactionService } from '../transaction/transaction.service';
import { Provider } from '../provider/provider.schema';
import { decryptConfig } from '../provider/provider.service';

/**
 * PaymentService
 * Handles standard payments (invoiceId required) and gateway/pending payments (PayOS).
 *
 * Standard flow:   POST /payments { invoiceId, amount, date, method }
 *                  → validate invoice → save → create Transaction → recalculate invoice
 *
 * Gateway flow:    POST /payments { status:'pending', amount, metadata }
 *                  → find active PayOS provider → create PayOS link → save Payment(pending)
 *                  → return { paymentId, qrCode, checkoutUrl, expiredAt }
 *
 *   PayOS webhook: handleWebhookPaid(orderCode, paidAt, amount)
 *                  → update Payment(paid) → auto-create Invoice + Transaction
 *                  → notify PAG webhook
 */
@Injectable()
export class PaymentService extends BaseService<Payment> {
  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(Provider.name) private providerModel: Model<Provider>,
    private readonly invoiceService: InvoiceService,
    private readonly transactionService: TransactionService,
    @InjectQueue(WEBHOOK_OUTBOUND_QUEUE) private readonly webhookQueue: Queue,
  ) {
    super(paymentModel);
  }

  // ─── findAll ──────────────────────────────────────────────────────────────

  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext,
  ): Promise<FindManyResult<Payment>> {
    delete options.search;
    return super.findAll(options, context);
  }

  async findById(id: ObjectId, context: RequestContext): Promise<Partial<Payment>> {
    const payment = await super.findById(id, context);
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(data: any, context: RequestContext): Promise<any> {
    if (data.status === 'pending') {
      return this.createPendingPayment(data, context);
    }

    // Standard payment — requires invoiceId, date, method
    if (!data.invoiceId) throw new BadRequestException('invoiceId is required for standard payments');
    if (!data.date) throw new BadRequestException('date is required for standard payments');
    if (!data.method) throw new BadRequestException('method is required for standard payments');

    const invoice = await this.invoiceService.findById(data.invoiceId as any, context);
    if (['paid', 'cancelled'].includes(invoice.status as string)) {
      throw new BadRequestException(`Cannot record payment for invoice with status: ${invoice.status}`);
    }

    const payment = await super.create(data, context) as Payment & { _id: any };
    const tx = await this.transactionService.createFromPayment(payment, invoice as any, context);
    await this.paymentModel.updateOne({ _id: payment._id }, { transactionId: String((tx as any)._id) });
    await this.recalculateInvoice(String((invoice as any)._id ?? data.invoiceId), invoice.totalAmount!.currency, context);

    return { ...payment, transactionId: String((tx as any)._id) };
  }

  // ─── Gateway: create pending payment via PayOS ────────────────────────────

  private async createPendingPayment(data: any, context: RequestContext): Promise<any> {
    const encryptionKeyHex = process.env.CBM_PROVIDER_CONFIG_KEY;
    if (!encryptionKeyHex || encryptionKeyHex.length !== 64) {
      throw new BadRequestException('Payment gateway not configured (missing encryption key)');
    }
    const encryptionKey = Buffer.from(encryptionKeyHex, 'hex');

    const providerRecord = await this.providerModel.findOne({
      'owner.orgId': context.orgId,
      type: 'payment-gateway',
      status: 'active',
      isDeleted: { $ne: true },
    }).lean();

    if (!providerRecord) {
      throw new BadRequestException('No active payment gateway configured for this organization');
    }

    let config: Record<string, any>;
    try {
      config = JSON.parse(decryptConfig(providerRecord.config as string, encryptionKey));
    } catch {
      throw new BadRequestException('Failed to read payment gateway configuration');
    }

    const orderCode = Date.now();
    const expiredAt = new Date(Date.now() + 15 * 60 * 1000);
    const description = (data.metadata?.planName || data.note || 'TranGPT subscription').slice(0, 25);

    const PayOS = require('@payos/node');
    const payos = new PayOS(config.clientId, config.apiKey, config.checksumKey);

    let payosResult: any;
    try {
      payosResult = await payos.createPaymentLink({
        orderCode,
        amount: data.amount.value,
        description,
        returnUrl: process.env.PAYOS_RETURN_URL || 'https://trangpt.hydrabyte.co',
        cancelUrl: process.env.PAYOS_CANCEL_URL || 'https://trangpt.hydrabyte.co',
        expiredAt: Math.floor(expiredAt.getTime() / 1000),
        buyerName: data.metadata?.platformUserId,
      });
    } catch (err: any) {
      this.logger.error(`PayOS createPaymentLink failed: ${err.message}`);
      throw new BadRequestException(`Payment gateway error: ${err.message}`);
    }

    const payment = await super.create({
      amount: data.amount,
      method: 'gateway',
      note: data.note,
      metadata: data.metadata,
      status: 'pending',
      expiredAt,
      gatewayData: {
        provider: providerRecord.provider,
        orderCode,
        linkId: payosResult.paymentLinkId,
        qrCode: payosResult.qrCode,
        checkoutUrl: payosResult.checkoutUrl,
      },
      ...(data.webhookUrl ? { webhookUrl: data.webhookUrl, webhookSecret: data.webhookSecret } : {}),
    }, context) as Payment & { _id: any };

    return {
      paymentId: String(payment._id),
      qrCode: payosResult.qrCode,
      checkoutUrl: payosResult.checkoutUrl,
      amount: data.amount,
      expiredAt,
    };
  }

  // ─── Webhook handler (called by ProviderController) ───────────────────────

  async handleWebhookPaid(orderCode: number, paidAt: Date, amount: number): Promise<void> {
    const payment = await this.paymentModel.findOne({
      'gatewayData.orderCode': orderCode,
      isDeleted: { $ne: true },
    }).lean();

    if (!payment) {
      this.logger.warn(`Webhook received for unknown orderCode: ${orderCode}`);
      return;
    }

    if (payment.status === 'paid') {
      this.logger.log(`Duplicate webhook for orderCode ${orderCode} — already paid, skipping`);
      return;
    }

    const isExpired = payment.status === 'expired';
    const orgOwner = { orgId: (payment as any).owner?.orgId, userId: (payment as any).createdBy };

    // Auto-create Invoice
    const invoice = await this.invoiceService.createAutoInvoice(
      payment.amount,
      payment.metadata?.planName || 'Gateway payment',
      paidAt,
      orgOwner,
    );
    const invoiceId = String((invoice as any)._id);

    // Mark payment as paid
    await this.paymentModel.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: 'paid',
          date: paidAt,
          invoiceId,
          ...(isExpired ? { reconciliation: { needed: true, reason: 'expired_qr' } } : {}),
        },
      },
    );

    // Create Transaction
    const paidPayment = { ...payment, status: 'paid', date: paidAt, invoiceId } as any;
    const tx = await this.transactionService.createFromPayment(paidPayment, invoice as any, {
      orgId: orgOwner.orgId,
      userId: orgOwner.userId,
    } as any);
    await this.paymentModel.updateOne({ _id: payment._id }, { $set: { transactionId: String((tx as any)._id) } });

    if (isExpired) {
      this.logger.warn(`Payment ${payment._id} paid after QR expired — flagged for reconciliation`);
      await this.sendDiscordAlert(
        `⚠️ **Payment tra soát** | ID: \`${payment._id}\` | User: \`${payment.metadata?.platformUserId ?? 'unknown'}\` | Amount: ${amount} VND | Lý do: QR đã hết hạn`,
      );
      return;
    }

    if (payment.webhookUrl) {
      await this.webhookQueue.add(
        'payment.success',
        {
          url: payment.webhookUrl,
          secret: payment.webhookSecret || '',
          payload: {
            event: 'payment.success',
            paymentId: String(payment._id),
            metadata: payment.metadata,
            paidAt: paidAt.toISOString(),
            reconciliation: { needed: false },
          },
        },
        {
          attempts: 4,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    }
  }

  // ─── Soft delete ──────────────────────────────────────────────────────────

  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Payment>> {
    const payment = await super.findById(id, context);
    if (!payment) throw new NotFoundException('Payment not found');

    if ((payment as any).status === 'pending') {
      throw new BadRequestException('Cannot delete a pending payment — let it expire or cancel via gateway');
    }

    const result = await super.softDelete(id, context);

    if (payment.transactionId) {
      await this.transactionService.softDeleteByReference('payment', String(id));
    }

    if (payment.invoiceId) {
      const invoice = await this.invoiceService.findById(payment.invoiceId as any, context).catch(() => null);
      if (invoice) {
        await this.recalculateInvoice(
          String((invoice as any)._id ?? payment.invoiceId),
          invoice.totalAmount!.currency,
          context,
        );
      }
    }

    return result;
  }

  // ─── Cron: expire pending payments ───────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async expirePendingPayments(): Promise<void> {
    const result = await this.paymentModel.updateMany(
      { status: 'pending', expiredAt: { $lt: new Date() }, isDeleted: { $ne: true } },
      { $set: { status: 'expired' } },
    );
    if (result.modifiedCount > 0) {
      this.logger.log(`Expired ${result.modifiedCount} pending payment(s)`);
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async recalculateInvoice(invoiceId: string, currency: string, context: RequestContext): Promise<void> {
    const payments = await this.paymentModel.find({
      invoiceId,
      isDeleted: { $ne: true },
      'amount.currency': currency,
      $or: [{ status: 'paid' }, { status: { $exists: false } }],
    }).lean();

    const totalPaid = payments.reduce((sum, p) => sum + (p.amount?.value ?? 0), 0);
    await this.invoiceService.recalculateStatus(invoiceId, totalPaid, currency);
  }

  private async sendDiscordAlert(message: string): Promise<void> {
    const webhookUrl = process.env.CBM_DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message }),
      });
    } catch (err: any) {
      this.logger.error(`Discord alert failed: ${err.message}`);
    }
  }
}
