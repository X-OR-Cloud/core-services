import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Expense } from './expense.schema';
import { TransactionService } from '../transaction/transaction.service';

/**
 * ExpenseService
 * Manages expense records with org-scoped CRUD and statistics.
 *
 * Phase 3 additions:
 * - approve action → creates Transaction
 * - reject action (requires rejectionReason)
 * - resubmit action
 * - update/delete restricted to pending/rejected status
 */
@Injectable()
export class ExpenseService extends BaseService<Expense> {
  constructor(
    @InjectModel(Expense.name) private expenseModel: Model<Expense>,
    private readonly transactionService: TransactionService
  ) {
    super(expenseModel);
  }

  /**
   * Override create — force status to 'pending'.
   */
  async create(data: any, context: RequestContext): Promise<Partial<Expense>> {
    data.status = 'pending';
    return super.create(data, context);
  }

  /**
   * Override findAll with search support and statistics aggregation.
   */
  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<Expense>> {
    const searchQuery = options.search || (options.filter as any)?.search;
    if (searchQuery && typeof searchQuery === 'string') {
      const searchRegex = new RegExp(searchQuery, 'i');
      const searchConditions = [
        { description: searchRegex },
        { notes: searchRegex },
        { vendorName: searchRegex },
        { tags: searchQuery },
      ];
      const existingFilter: any = {};
      if (options) {
        Object.keys(options).forEach((key) => {
          if (key !== 'search') existingFilter[key] = (options as any)[key];
        });
      }
      options = { ...existingFilter, $or: searchConditions };
    }

    delete options.search;

    const findResult = await super.findAll(options, context);

    const baseMatch: any = { isDeleted: false };
    if (context.orgId) baseMatch['owner.orgId'] = context.orgId;

    let matchFilter: any;
    if (options.filter && Object.keys(options.filter).length > 0) {
      matchFilter = { $and: [baseMatch, options.filter] };
    } else {
      matchFilter = baseMatch;
    }

    const statusStats = await super.aggregate(
      [
        { $match: matchFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ],
      context
    );

    const statistics: any = { total: findResult.pagination.total, byStatus: {} };
    statusStats.forEach((stat: any) => {
      statistics.byStatus[stat._id] = stat.count;
    });

    findResult.statistics = statistics;
    return findResult;
  }

  async findById(id: ObjectId, context: RequestContext): Promise<Expense> {
    const expense = await super.findById(id, context);
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<Expense>> {
    const expense = await super.findById(id, context);
    if (!expense) throw new NotFoundException('Expense not found');
    if (!['pending', 'rejected'].includes(expense.status)) {
      throw new BadRequestException(`Expense can only be updated in pending or rejected status (current: ${expense.status})`);
    }
    return super.update(id, data, context);
  }

  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Expense>> {
    const expense = await super.findById(id, context);
    if (!expense) throw new NotFoundException('Expense not found');
    if (!['pending', 'rejected'].includes(expense.status)) {
      throw new BadRequestException(`Expense can only be deleted in pending or rejected status (current: ${expense.status})`);
    }
    return super.softDelete(id, context);
  }

  // =============== Phase 3: State machine ===============

  async approve(id: ObjectId, context: RequestContext): Promise<Partial<Expense>> {
    const expense = await super.findById(id, context);
    if (!expense) throw new NotFoundException('Expense not found');
    if (expense.status !== 'pending') {
      throw new BadRequestException(`Expense must be in pending status to approve (current: ${expense.status})`);
    }
    const updated = await super.update(id, { status: 'approved' }, context);
    // Create Transaction record
    await this.transactionService.createFromExpense(
      { ...(expense as any), status: 'approved' },
      context
    );
    return updated;
  }

  async reject(id: ObjectId, rejectionReason: string, context: RequestContext): Promise<Partial<Expense>> {
    const expense = await super.findById(id, context);
    if (!expense) throw new NotFoundException('Expense not found');
    if (expense.status !== 'pending') {
      throw new BadRequestException(`Expense must be in pending status to reject (current: ${expense.status})`);
    }
    return super.update(id, { status: 'rejected', rejectionReason }, context);
  }

  async resubmit(id: ObjectId, context: RequestContext): Promise<Partial<Expense>> {
    const expense = await super.findById(id, context);
    if (!expense) throw new NotFoundException('Expense not found');
    if (expense.status !== 'rejected') {
      throw new BadRequestException(`Expense must be in rejected status to resubmit (current: ${expense.status})`);
    }
    return super.update(id, { status: 'pending', rejectionReason: null }, context);
  }
}
