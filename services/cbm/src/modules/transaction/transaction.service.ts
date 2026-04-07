import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Transaction } from './transaction.schema';

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
  //
  // async createFromPayment(payment: Payment, invoice: Invoice, context: RequestContext): Promise<Transaction>
  // async createFromExpense(expense: Expense, context: RequestContext): Promise<Transaction>
  // async softDeleteByReference(referenceType: string, referenceId: string): Promise<void>
  // async getSummary(query: TransactionSummaryQueryDto, context: RequestContext): Promise<any>
}
