import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Payment } from './payment.schema';
import { InvoiceService } from '../invoice/invoice.service';
import { TransactionService } from '../transaction/transaction.service';

/**
 * PaymentService
 * Records payments against invoices.
 * Payments are immutable — no update, only create or void (soft delete).
 *
 * Phase 3 additions:
 * - On create: validate invoiceId, recalculate Invoice status, create Transaction
 * - On delete: reverse Invoice status, soft-delete linked Transaction
 */
@Injectable()
export class PaymentService extends BaseService<Payment> {
  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    private readonly invoiceService: InvoiceService,
    private readonly transactionService: TransactionService
  ) {
    super(paymentModel);
  }

  /**
   * Override findAll with basic filter support.
   */
  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<Payment>> {
    delete options.search;
    return super.findAll(options, context);
  }

  async findById(id: ObjectId, context: RequestContext): Promise<Partial<Payment>> {
    const payment = await super.findById(id, context);
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  /**
   * Override create — validate invoice, save payment, create Transaction, recalculate Invoice status.
   */
  async create(data: any, context: RequestContext): Promise<Partial<Payment>> {
    // 1. Validate invoice exists and is payable
    const invoice = await this.invoiceService.findById(
      data.invoiceId as any,
      context
    );
    if (['paid', 'cancelled'].includes(invoice.status)) {
      throw new BadRequestException(`Cannot record payment for invoice with status: ${invoice.status}`);
    }

    // 2. Save payment
    const payment = await super.create(data, context) as Payment & { _id: any };

    // 3. Create Transaction (income)
    const tx = await this.transactionService.createFromPayment(payment, invoice as any, context);

    // 4. Store transactionId on payment
    await this.paymentModel.updateOne({ _id: payment._id }, { transactionId: String((tx as any)._id) });

    // 5. Recalculate Invoice status
    await this.recalculateInvoice(String((invoice as any)._id ?? data.invoiceId), invoice.totalAmount.currency, context);

    return { ...payment, transactionId: String((tx as any)._id) };
  }

  /**
   * Void a payment (soft delete) — reverses Invoice status + soft-deletes Transaction.
   */
  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Payment>> {
    const payment = await super.findById(id, context);
    if (!payment) throw new NotFoundException('Payment not found');

    const result = await super.softDelete(id, context);

    // Soft-delete linked Transaction
    if (payment.transactionId) {
      await this.transactionService.softDeleteByReference('payment', String(id));
    }

    // Recalculate Invoice status after voiding
    const invoice = await this.invoiceService.findById(payment.invoiceId as any, context).catch(() => null);
    if (invoice) {
      await this.recalculateInvoice(String((invoice as any)._id ?? payment.invoiceId), invoice.totalAmount.currency, context);
    }

    return result;
  }

  /**
   * Sum all active payments for an invoice, then update invoice status.
   */
  private async recalculateInvoice(invoiceId: string, currency: string, context: RequestContext): Promise<void> {
    const payments = await this.paymentModel.find({
      invoiceId,
      isDeleted: { $ne: true },
      'amount.currency': currency,
    }).lean();

    const totalPaid = payments.reduce((sum, p) => sum + (p.amount?.value ?? 0), 0);
    await this.invoiceService.recalculateStatus(invoiceId, totalPaid, currency);
  }
}
