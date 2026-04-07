import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Transaction, TransactionSnapshot } from './transaction.schema';
import { Payment } from '../payment/payment.schema';
import { Invoice } from '../invoice/invoice.schema';
import { Expense } from '../expense/expense.schema';
import { TransactionSummaryQueryDto } from './transaction.dto';

/**
 * TransactionService
 * Read-only ledger service — Transactions are auto-generated.
 * Internal creation methods are called by PaymentService and ExpenseService.
 *
 * Phase 3 additions:
 * - createFromPayment(payment, invoice, context)
 * - createFromExpense(expense, context)
 * - softDeleteByReference(referenceType, referenceId)
 * - getSummary(query, context) — aggregate income vs expense
 */
@Injectable()
export class TransactionService extends BaseService<Transaction> {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>
  ) {
    super(transactionModel);
  }

  /**
   * Override findAll — transactions are read-only, no write via findAll.
   */
  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<Transaction>> {
    delete options.search;
    return super.findAll(options, context);
  }

  async findById(id: ObjectId, context: RequestContext): Promise<Transaction> {
    const transaction = await super.findById(id, context);
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  // =============== Phase 3: Internal creation + summary methods ===============

  /**
   * Called by PaymentService on payment creation.
   * Creates a Transaction of type 'income'.
   */
  async createFromPayment(
    payment: Payment & { _id: any },
    invoice: Invoice & { _id: any },
    context: RequestContext
  ): Promise<Transaction> {
    const snapshot: TransactionSnapshot = {
      description: `Payment received for invoice ${(invoice as any).code}`,
      invoiceCode: (invoice as any).code,
    };

    const data = {
      type: 'income',
      amount: payment.amount,
      date: payment.date,
      referenceType: 'payment',
      referenceId: String(payment._id),
      snapshot,
    };

    return super.create(data, context) as any;
  }

  /**
   * Called by ExpenseService on expense approval.
   * Creates a Transaction of type 'expense'.
   */
  async createFromExpense(
    expense: Expense & { _id: any },
    context: RequestContext
  ): Promise<Transaction> {
    const snapshot: TransactionSnapshot = {
      description: `Expense approved: ${expense.description}`,
      expenseCategory: expense.category,
    };

    const data = {
      type: 'expense',
      amount: expense.amount,
      date: expense.date,
      referenceType: 'expense',
      referenceId: String(expense._id),
      snapshot,
    };

    return super.create(data, context) as any;
  }

  /**
   * Called by PaymentService on payment void (soft delete).
   * Soft-deletes the linked Transaction.
   */
  async softDeleteByReference(referenceType: string, referenceId: string): Promise<void> {
    await this.transactionModel.updateOne(
      { referenceType, referenceId, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: new Date() }
    );
  }

  /**
   * Aggregate income vs expense totals, grouped by period and currency.
   */
  async getSummary(
    query: TransactionSummaryQueryDto,
    context: RequestContext
  ): Promise<any> {
    const match: any = { isDeleted: { $ne: true } };
    if (context.orgId) match['owner.orgId'] = context.orgId;
    if (query.currency) match['amount.currency'] = query.currency;
    if (query.dateFrom || query.dateTo) {
      match.date = {};
      if (query.dateFrom) match.date.$gte = new Date(query.dateFrom);
      if (query.dateTo) match.date.$lte = new Date(query.dateTo);
    }

    // Group format per period
    let dateGroupId: any;
    switch (query.period) {
      case 'day':
        dateGroupId = { year: { $year: '$date' }, month: { $month: '$date' }, day: { $dayOfMonth: '$date' } };
        break;
      case 'month':
        dateGroupId = { year: { $year: '$date' }, month: { $month: '$date' } };
        break;
      case 'year':
      default:
        dateGroupId = { year: { $year: '$date' } };
    }

    const results = await this.transactionModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { type: '$type', currency: '$amount.currency', period: dateGroupId },
          total: { $sum: '$amount.value' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.period.year': -1, '_id.period.month': -1, '_id.period.day': -1 } },
    ]);

    return { data: results };
  }
}
