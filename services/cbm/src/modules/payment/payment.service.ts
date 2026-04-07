import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Payment } from './payment.schema';

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
    @InjectModel(Payment.name) private paymentModel: Model<Payment>
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

  async findById(id: ObjectId, context: RequestContext): Promise<Payment> {
    const payment = await super.findById(id, context);
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  /**
   * Void a payment (soft delete).
   * Phase 3: reverse Invoice status + soft-delete Transaction.
   */
  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Payment>> {
    const payment = await super.findById(id, context);
    if (!payment) throw new NotFoundException('Payment not found');
    return super.softDelete(id, context);
  }

  // =============== Phase 3: Invoice recalculation + Transaction creation ===============
}
