import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { isSuperAdmin } from '../project/project-access.helper';
import { Order } from './order.schema';
import { Contact } from '../contact/contact.schema';
import { DomainConfigService } from '../domain-config/domain-config.service';

// Statuses that allow PATCH data edits (separate from action workflow)
const EDITABLE_STATUSES = ['new', 'processing', 'deposited', 'active'];
const BOOKING_BLOCK_TYPES = ['room', 'maintenance'];

@Injectable()
export class OrderService extends BaseService<Order> {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Contact.name) private contactModel: Model<Contact>,
    private readonly domainConfigService: DomainConfigService,
  ) {
    super(orderModel);
  }

  async create(data: any, context: RequestContext): Promise<Partial<Order>> {
    data.code = await this.generateCode(context);
    data.status = 'new';

    const bookingType = data.metadata?.bookingType;
    if (bookingType === 'room') {
      if (!data.checkIn || !data.checkOut) {
        throw new BadRequestException('checkIn and checkOut are required for room bookings');
      }
      const checkIn = new Date(data.checkIn);
      const checkOut = new Date(data.checkOut);
      if (checkOut <= checkIn) {
        throw new BadRequestException('checkOut must be after checkIn');
      }
      const conflicts = await this.findConflicts(
        data.items?.map((i: any) => i.productId).filter(Boolean) || [],
        checkIn,
        checkOut,
        context,
        null,
      );
      if (conflicts.length > 0) {
        throw new ConflictException({
          message: 'One or more rooms are not available for the requested dates',
          conflicts,
        });
      }
      data.checkIn = checkIn;
      data.checkOut = checkOut;
    }

    // F-020: Auto-link or create Contact when phone is provided
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

    if (dateFrom && dateTo) {
      const from = new Date(dateFrom).getTime();
      const to = new Date(dateTo).getTime();
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
      if (to - from > ninetyDaysMs) {
        throw new BadRequestException('Date range cannot exceed 90 days');
      }
    }

    if (dateFrom || dateTo) {
      const createdAtFilter: any = {};
      if (dateFrom) createdAtFilter.$gte = new Date(dateFrom);
      if (dateTo) createdAtFilter.$lte = new Date(dateTo);
      rest.filter = { ...rest.filter, createdAt: createdAtFilter };
    }

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
      throw new BadRequestException(`Order can only be updated in editable status (current: ${order.status})`);
    }
    return super.update(id, data, context);
  }

  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Order>> {
    const order = await super.findById(id, context);
    if (!order) throw new NotFoundException('Order not found');

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

  // ── Config-driven state machine ────────────────────────────────────────────

  async executeAction(action: string, id: ObjectId, context: RequestContext): Promise<Partial<Order>> {
    const config = await this.domainConfigService.getOrderConfig(context.orgId);
    const actionDef = config.actions[action];

    if (!actionDef) {
      throw new ForbiddenException({ code: 'ACTION_NOT_AVAILABLE', message: `Action '${action}' is not available in this domain` });
    }

    const order = await super.findById(id, context);
    if (!order) throw new NotFoundException('Order not found');

    if (!actionDef.from.includes(order.status as string)) {
      throw new BadRequestException(`Cannot perform '${action}': order is '${order.status}', expected one of [${actionDef.from.join(', ')}]`);
    }

    return super.update(id, { status: actionDef.to }, context);
  }

  // ── Availability check ─────────────────────────────────────────────────────

  async checkAvailability(
    productIds: string[],
    checkIn: Date,
    checkOut: Date,
    context: RequestContext,
  ): Promise<{ available: string[]; booked: { productId: string; conflictOrderId: string; conflictCode: string }[] }> {
    if (checkOut <= checkIn) {
      throw new BadRequestException('checkOut must be after checkIn');
    }

    const conflicts = await this.findConflicts(productIds, checkIn, checkOut, context, null);
    const bookedProductIds = new Set(conflicts.map((c: any) => c.productId));
    const available = productIds.filter((id) => !bookedProductIds.has(id));

    return { available, booked: conflicts };
  }

  private async findConflicts(
    productIds: string[],
    checkIn: Date,
    checkOut: Date,
    context: RequestContext,
    excludeOrderId: string | null,
  ): Promise<{ productId: string; conflictOrderId: string; conflictCode: string }[]> {
    if (productIds.length === 0) return [];

    const match: any = {
      'owner.orgId': context.orgId,
      isDeleted: { $ne: true },
      'metadata.bookingType': { $in: BOOKING_BLOCK_TYPES },
      status: { $nin: ['cancelled', 'done'] },
      checkIn: { $lt: checkOut },
      checkOut: { $gt: checkIn },
      'items.productId': { $in: productIds },
    };

    if (excludeOrderId) {
      match._id = { $ne: excludeOrderId };
    }

    const conflictingOrders = await this.orderModel
      .find(match)
      .select('_id code items')
      .lean();

    const conflicts: { productId: string; conflictOrderId: string; conflictCode: string }[] = [];
    const requestedSet = new Set(productIds);

    for (const order of conflictingOrders) {
      for (const item of (order as any).items || []) {
        if (item.productId && requestedSet.has(item.productId)) {
          conflicts.push({
            productId: item.productId,
            conflictOrderId: String((order as any)._id),
            conflictCode: (order as any).code,
          });
        }
      }
    }

    return conflicts;
  }

  // ── Calendar ──────────────────────────────────────────────────────────────

  async getCalendar(
    month: string,
    bookingType: string | undefined,
    context: RequestContext,
  ): Promise<any[]> {
    const [year, mo] = month.split('-').map(Number);
    if (!year || !mo || mo < 1 || mo > 12) {
      throw new BadRequestException('month must be in YYYY-MM format');
    }
    const monthStart = new Date(year, mo - 1, 1);
    const monthEnd = new Date(year, mo, 1);

    const match: any = {
      'owner.orgId': context.orgId,
      isDeleted: { $ne: true },
      status: { $nin: ['cancelled'] },
      checkIn: { $lt: monthEnd },
      checkOut: { $gt: monthStart },
    };

    if (bookingType) {
      match['metadata.bookingType'] = bookingType;
    }

    const bookings = await this.orderModel
      .find(match)
      .select('_id code status checkIn checkOut items metadata customer')
      .lean();

    return bookings;
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
