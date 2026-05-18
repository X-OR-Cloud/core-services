import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { isSuperAdmin } from '../project/project-access.helper';
import { Order } from './order.schema';
import { Contact } from '../contact/contact.schema';

const EDITABLE_STATUSES = ['new', 'processing'];

@Injectable()
export class OrderService extends BaseService<Order> {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Contact.name) private contactModel: Model<Contact>
  ) {
    super(orderModel);
  }

  async create(data: any, context: RequestContext): Promise<Partial<Order>> {
    data.code = await this.generateCode(context);
    data.status = 'new';

    // F-020: Auto-link or create Contact when phone is provided and no existing contactId
    if (!data.customer?.id && data.customer?.phone) {
      try {
        const contactId = await this.autoLinkContact(data, context);
        if (contactId) data.customer.id = contactId;
      } catch {
        // Silent — order creation must not be blocked by contact logic
      }
    }

    return super.create(data, context);
  }

  /**
   * F-020: Find existing contact by phone+orgId (regardless of status) or create a new one.
   * Returns the contact _id as string, or null on failure.
   */
  private async autoLinkContact(data: any, context: RequestContext): Promise<string | null> {
    const existing = await this.contactModel.findOne({
      'owner.orgId': context.orgId,
      phone: data.customer.phone,
      isDeleted: { $ne: true },
    }).lean();

    if (existing) return String(existing._id);

    const created = await this.contactModel.create({
      name: data.customer.name,
      phone: data.customer.phone,
      address: data.customer.address || data.delivery?.address || undefined,
      types: ['customer'],
      status: 'active',
      owner: { orgId: context.orgId, userId: context.userId, groupId: '', agentId: '', appId: '' },
      createdBy: { userId: context.userId, roles: context.roles, orgId: context.orgId, groupId: '', agentId: '', appId: '' },
      updatedBy: { userId: context.userId, roles: context.roles, orgId: context.orgId, groupId: '', agentId: '', appId: '' },
    });

    return String(created._id);
  }

  async findAll(
    options: FindManyOptions & { search?: string; dateFrom?: string; dateTo?: string },
    context: RequestContext
  ): Promise<FindManyResult<Order>> {
    const { search, dateFrom, dateTo, ...rest } = options as any;

    // Validate 90-day range limit
    if (dateFrom && dateTo) {
      const from = new Date(dateFrom).getTime();
      const to = new Date(dateTo).getTime();
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
      if (to - from > ninetyDaysMs) {
        throw new BadRequestException('Date range cannot exceed 90 days');
      }
    }

    // Apply date filter
    if (dateFrom || dateTo) {
      const createdAtFilter: any = {};
      if (dateFrom) createdAtFilter.$gte = new Date(dateFrom);
      if (dateTo) createdAtFilter.$lte = new Date(dateTo);
      rest.filter = { ...rest.filter, createdAt: createdAtFilter };
    }

    // Apply search filter (code, customer name/phone, product name in items)
    // NOTE: $or must be inside filter{} — BaseService uses options.filter when defined,
    // so top-level $or would be ignored if filter already exists (e.g. from dateFrom/dateTo)
    let baseOptions = rest;
    if (search) {
      const regex = new RegExp(search, 'i');
      baseOptions = {
        ...rest,
        filter: {
          ...(rest.filter || {}),
          $or: [
            { code: regex },
            { 'customer.name': regex },
            { 'customer.phone': regex },
            { 'items.name': regex },
          ],
        },
      } as any;
    }

    const findResult = await super.findAll(baseOptions, context);

    // byStatus: aggregate with same date filter (no status filter) for accurate breakdown
    const baseMatch: any = { isDeleted: false };
    if (context.orgId) baseMatch['owner.orgId'] = context.orgId;
    if (dateFrom || dateTo) {
      const createdAtFilter: any = {};
      if (dateFrom) createdAtFilter.$gte = new Date(dateFrom);
      if (dateTo) createdAtFilter.$lte = new Date(dateTo);
      baseMatch.createdAt = createdAtFilter;
    }

    const statusStats = await super.aggregate(
      [{ $match: baseMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }],
      context
    );

    const statistics: any = { total: findResult.pagination.total, byStatus: {} };
    statusStats.forEach((s: any) => { statistics.byStatus[s._id] = s.count; });
    findResult.statistics = statistics;

    return findResult;
  }

  async findById(id: ObjectId, context: RequestContext): Promise<Partial<Order>> {
    const order = await super.findById(id, context);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<Order>> {
    const order = await super.findById(id, context);
    if (!order) throw new NotFoundException('Order not found');
    if (!EDITABLE_STATUSES.includes(order.status as string)) {
      throw new BadRequestException(`Order can only be updated in new or processing status (current: ${order.status})`);
    }
    return super.update(id, data, context);
  }

  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Order>> {
    const order = await super.findById(id, context);
    if (!order) throw new NotFoundException('Order not found');

    // organization.owner can delete any status
    // organization.editor can only delete new or processing
    if (!isSuperAdmin(context)) {
      const EDITOR_DELETABLE = ['new', 'processing'];
      if (!EDITOR_DELETABLE.includes(order.status as string)) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'ORDER_CANNOT_DELETE',
          message: `Cannot delete an order with status: ${order.status}`,
        });
      }
    }

    return super.softDelete(id, context);
  }

  // ── State machine ──────────────────────────────────────────────────────────

  async process(id: ObjectId, context: RequestContext): Promise<Partial<Order>> {
    const order = await super.findById(id, context);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'new') {
      throw new BadRequestException(`Order must be in new status to process (current: ${order.status})`);
    }
    return super.update(id, { status: 'processing' }, context);
  }

  async complete(id: ObjectId, context: RequestContext): Promise<Partial<Order>> {
    const order = await super.findById(id, context);
    if (!order) throw new NotFoundException('Order not found');
    if (!EDITABLE_STATUSES.includes(order.status as string)) {
      throw new BadRequestException(`Order must be in new or processing status to complete (current: ${order.status})`);
    }
    return super.update(id, { status: 'done' }, context);
  }

  async cancel(id: ObjectId, context: RequestContext): Promise<Partial<Order>> {
    const order = await super.findById(id, context);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'cancelled') {
      throw new BadRequestException('Order is already cancelled');
    }
    if (order.status === 'done') {
      throw new BadRequestException('Cannot cancel a completed order');
    }
    return super.update(id, { status: 'cancelled' }, context);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getStats(
    query: { dateFrom: string; dateTo: string },
    context: RequestContext
  ): Promise<{ totalRevenue: number; totalOrders: number; items: any[] }> {
    if (!isSuperAdmin(context)) {
      throw new ForbiddenException('Only organization owners can access revenue stats');
    }

    const from = new Date(query.dateFrom);
    const to = new Date(query.dateTo);

    if (to < from) {
      throw new BadRequestException('dateTo must be after dateFrom');
    }
    if (to.getTime() - from.getTime() > 93 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Date range cannot exceed 93 days');
    }

    const result = await this.orderModel.aggregate([
      {
        $match: {
          'owner.orgId': context.orgId,
          status: 'done',
          isDeleted: { $ne: true },
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $facet: {
          totals: [
            { $group: { _id: null, totalRevenue: { $sum: '$totalAmount.value' }, totalOrders: { $sum: 1 } } },
          ],
          items: [
            { $unwind: '$items' },
            { $group: { _id: '$items.name', totalAmount: { $sum: '$items.amount.value' }, totalQuantity: { $sum: '$items.quantity' } } },
            { $sort: { totalAmount: -1 } },
          ],
        },
      },
    ]);

    const totals = result[0]?.totals[0] ?? { totalRevenue: 0, totalOrders: 0 };
    const items = (result[0]?.items ?? []).map((i: any) => ({
      name: i._id,
      totalAmount: i.totalAmount,
      totalQuantity: i.totalQuantity,
    }));

    return { totalRevenue: totals.totalRevenue, totalOrders: totals.totalOrders, items };
  }

  // ── Code generation ────────────────────────────────────────────────────────

  private async generateCode(context: RequestContext): Promise<string> {
    const today = new Date();
    const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `ORD-${yyyymmdd}-`;

    // Include soft-deleted orders to avoid duplicate code (unique index covers all docs)
    const orgMatch: any = { code: new RegExp(`^${prefix}`) };
    if (context.orgId) orgMatch['owner.orgId'] = context.orgId;

    const last = await this.orderModel
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
}
