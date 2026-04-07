import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Invoice } from './invoice.schema';

/**
 * InvoiceService
 * Manages invoice entities with org-scoped CRUD and statistics.
 *
 * Phase 3 additions:
 * - code auto-generation (INV-{YYYY}-{seq:04d} per org)
 * - state machine: send, mark-overdue, cancel, reopen
 * - update/delete restricted by status
 * - eInvoice linking
 */
@Injectable()
export class InvoiceService extends BaseService<Invoice> {
  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<Invoice>
  ) {
    super(invoiceModel);
  }

  /**
   * Override create — force status to 'draft'.
   * Phase 3: add code auto-generation.
   */
  async create(data: any, context: RequestContext): Promise<Partial<Invoice>> {
    data.status = 'draft';
    return super.create(data, context);
  }

  /**
   * Override findAll with search support and statistics aggregation.
   */
  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<Invoice>> {
    const searchQuery = options.search || (options.filter as any)?.search;
    if (searchQuery && typeof searchQuery === 'string') {
      const searchRegex = new RegExp(searchQuery, 'i');
      const searchConditions = [
        { code: searchRegex },
        { notes: searchRegex },
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

  async findById(id: ObjectId, context: RequestContext): Promise<Invoice> {
    const invoice = await super.findById(id, context);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<Invoice>> {
    const invoice = await super.findById(id, context);
    if (!invoice) throw new NotFoundException('Invoice not found');
    // Phase 3: restrict update to draft status only
    return super.update(id, data, context);
  }

  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Invoice>> {
    const invoice = await super.findById(id, context);
    if (!invoice) throw new NotFoundException('Invoice not found');
    // Phase 3: restrict delete to draft/cancelled status only
    return super.softDelete(id, context);
  }

  // =============== Phase 3: State machine + eInvoice + code generation ===============
}
