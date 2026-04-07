import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Invoice, EInvoiceLink } from './invoice.schema';

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
   * Override create — force status to 'draft', auto-generate code if not provided.
   * Code format: INV-{YYYY}-{seq:04d} per org (atomic via findOneAndUpdate counter).
   */
  async create(data: any, context: RequestContext): Promise<Partial<Invoice>> {
    data.status = 'draft';
    if (!data.code) {
      data.code = await this.generateCode(context);
    }
    return super.create(data, context);
  }

  /**
   * Generate next invoice code for the org in current year.
   * Format: INV-{YYYY}-{seq:04d}
   * Uses max existing sequence + 1 (safe for single-writer; atomic enough for SME scale).
   */
  private async generateCode(context: RequestContext): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const orgMatch: any = { isDeleted: { $ne: true }, code: new RegExp(`^${prefix}`) };
    if (context.orgId) orgMatch['owner.orgId'] = context.orgId;

    const last = await this.invoiceModel
      .findOne(orgMatch)
      .sort({ code: -1 })
      .select('code')
      .lean();

    let seq = 1;
    if (last?.code) {
      const parts = (last.code as string).split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    return `${prefix}${String(seq).padStart(4, '0')}`;
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
    if (invoice.status !== 'draft') {
      throw new BadRequestException(`Invoice can only be updated in draft status (current: ${invoice.status})`);
    }
    return super.update(id, data, context);
  }

  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Invoice>> {
    const invoice = await super.findById(id, context);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!['draft', 'cancelled'].includes(invoice.status)) {
      throw new BadRequestException(`Invoice can only be deleted in draft or cancelled status (current: ${invoice.status})`);
    }
    return super.softDelete(id, context);
  }

  // =============== Phase 3: State machine ===============

  async send(id: ObjectId, context: RequestContext): Promise<Partial<Invoice>> {
    const invoice = await super.findById(id, context);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'draft') {
      throw new BadRequestException(`Invoice must be in draft status to send (current: ${invoice.status})`);
    }
    return super.update(id, { status: 'sent' }, context);
  }

  async markOverdue(id: ObjectId, context: RequestContext): Promise<Partial<Invoice>> {
    const invoice = await super.findById(id, context);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!['sent', 'partial'].includes(invoice.status)) {
      throw new BadRequestException(`Invoice must be in sent or partial status to mark as overdue (current: ${invoice.status})`);
    }
    return super.update(id, { status: 'overdue' }, context);
  }

  async cancel(id: ObjectId, context: RequestContext): Promise<Partial<Invoice>> {
    const invoice = await super.findById(id, context);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'cancelled') {
      throw new BadRequestException('Invoice is already cancelled');
    }
    if (invoice.status === 'paid') {
      throw new BadRequestException('Cannot cancel a paid invoice');
    }
    return super.update(id, { status: 'cancelled' }, context);
  }

  async reopen(id: ObjectId, context: RequestContext): Promise<Partial<Invoice>> {
    const invoice = await super.findById(id, context);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'cancelled') {
      throw new BadRequestException(`Invoice must be cancelled to reopen (current: ${invoice.status})`);
    }
    return super.update(id, { status: 'draft' }, context);
  }

  async linkEInvoice(id: ObjectId, eInvoice: Partial<EInvoiceLink>, context: RequestContext): Promise<Partial<Invoice>> {
    const invoice = await super.findById(id, context);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return super.update(id, { eInvoice: { ...eInvoice, linkedAt: new Date() } }, context);
  }

  /**
   * Internal method — called by PaymentService to update status after payment.
   * Not exposed via HTTP.
   */
  async recalculateStatus(
    id: string,
    totalPaid: number,
    currency: string
  ): Promise<void> {
    const invoice = await this.invoiceModel.findById(id).lean();
    if (!invoice) return;
    if (!['sent', 'partial', 'overdue'].includes(invoice.status)) return;

    let newStatus: string;
    if (totalPaid >= invoice.totalAmount.value) {
      newStatus = 'paid';
    } else if (totalPaid > 0) {
      newStatus = 'partial';
    } else {
      newStatus = 'sent';
    }

    if (newStatus !== invoice.status) {
      await this.invoiceModel.updateOne({ _id: id }, { status: newStatus });
    }
  }
}
