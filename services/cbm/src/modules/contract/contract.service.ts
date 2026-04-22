import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Contract } from './contract.schema';
import { EInvoiceLink } from '../invoice/invoice.schema';

/**
 * ContractService
 * Manages service contracts with org-scoped CRUD, state machine and statistics.
 *
 * State machine:
 *   draft → active → expired | terminated | cancelled
 *   cancelled → draft (reopen)
 *
 * Code auto-generation: CTR-{YYYY}-{seq:04d} per org
 */
@Injectable()
export class ContractService extends BaseService<Contract> {
  constructor(
    @InjectModel(Contract.name) private contractModel: Model<Contract>
  ) {
    super(contractModel);
  }

  /**
   * Override create — force status to 'draft', auto-generate code if not provided.
   */
  async create(data: any, context: RequestContext): Promise<Partial<Contract>> {
    data.status = 'draft';
    if (!data.code) {
      data.code = await this.generateCode(context);
    }
    return super.create(data, context);
  }

  /**
   * Generate next contract code for the org in current year.
   * Format: CTR-{YYYY}-{seq:04d}
   */
  private async generateCode(context: RequestContext): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `CTR-${year}-`;
    const orgMatch: any = { isDeleted: { $ne: true }, code: new RegExp(`^${prefix}`) };
    if (context.orgId) orgMatch['owner.orgId'] = context.orgId;

    const last = await this.contractModel
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
   * findAll with search support and statistics (total + byStatus + byType).
   */
  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<Contract>> {
    const searchQuery = options.search || (options.filter as any)?.search;
    if (searchQuery && typeof searchQuery === 'string') {
      const searchRegex = new RegExp(searchQuery, 'i');
      const searchConditions = [
        { code: searchRegex },
        { title: searchRegex },
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
    delete (options as any).search;

    const findResult = await super.findAll(options, context);

    const baseMatch: any = { isDeleted: false };
    if (context.orgId) baseMatch['owner.orgId'] = context.orgId;

    let matchFilter: any;
    if (options.filter && Object.keys(options.filter).length > 0) {
      matchFilter = { $and: [baseMatch, options.filter] };
    } else {
      matchFilter = baseMatch;
    }

    const [statusStats, typeStats] = await Promise.all([
      super.aggregate(
        [{ $match: matchFilter }, { $group: { _id: '$status', count: { $sum: 1 } } }],
        context
      ),
      super.aggregate(
        [{ $match: matchFilter }, { $group: { _id: '$type', count: { $sum: 1 } } }],
        context
      ),
    ]);

    const statistics: any = {
      total: findResult.pagination.total,
      byStatus: {},
      byType: {},
    };
    statusStats.forEach((s: any) => { statistics.byStatus[s._id] = s.count; });
    typeStats.forEach((s: any) => { statistics.byType[s._id] = s.count; });

    findResult.statistics = statistics;
    return findResult;
  }

  async findById(id: ObjectId, context: RequestContext): Promise<Partial<Contract>> {
    const contract = await super.findById(id, context);
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  /**
   * Update allowed in draft status only.
   */
  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<Contract>> {
    const contract = await super.findById(id, context);
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status !== 'draft') {
      throw new BadRequestException(`Contract can only be updated in draft status (current: ${contract.status})`);
    }
    return super.update(id, data, context);
  }

  /**
   * Soft delete allowed in draft or cancelled status.
   */
  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Contract>> {
    const contract = await super.findById(id, context);
    if (!contract) throw new NotFoundException('Contract not found');
    if (!['draft', 'cancelled'].includes(contract.status)) {
      throw new BadRequestException(
        `Contract can only be deleted in draft or cancelled status (current: ${contract.status})`
      );
    }
    return super.softDelete(id, context);
  }

  // ========== State machine ==========

  async activate(id: ObjectId, context: RequestContext): Promise<Partial<Contract>> {
    const contract = await super.findById(id, context);
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status !== 'draft') {
      throw new BadRequestException(`Contract must be in draft status to activate (current: ${contract.status})`);
    }
    return super.update(id, { status: 'active' }, context);
  }

  async expire(id: ObjectId, context: RequestContext): Promise<Partial<Contract>> {
    const contract = await super.findById(id, context);
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status !== 'active') {
      throw new BadRequestException(`Contract must be active to mark as expired (current: ${contract.status})`);
    }
    return super.update(id, { status: 'expired' }, context);
  }

  async terminate(id: ObjectId, context: RequestContext): Promise<Partial<Contract>> {
    const contract = await super.findById(id, context);
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status !== 'active') {
      throw new BadRequestException(`Contract must be active to terminate (current: ${contract.status})`);
    }
    return super.update(id, { status: 'terminated' }, context);
  }

  async cancel(id: ObjectId, context: RequestContext): Promise<Partial<Contract>> {
    const contract = await super.findById(id, context);
    if (!contract) throw new NotFoundException('Contract not found');
    if (['cancelled', 'expired', 'terminated'].includes(contract.status)) {
      throw new BadRequestException(`Cannot cancel contract in ${contract.status} status`);
    }
    return super.update(id, { status: 'cancelled' }, context);
  }

  async reopen(id: ObjectId, context: RequestContext): Promise<Partial<Contract>> {
    const contract = await super.findById(id, context);
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status !== 'cancelled') {
      throw new BadRequestException(`Contract must be cancelled to reopen (current: ${contract.status})`);
    }
    return super.update(id, { status: 'draft' }, context);
  }

  async linkEInvoice(
    id: ObjectId,
    eInvoice: Partial<EInvoiceLink>,
    eInvoiceRawData: Record<string, any> | undefined,
    context: RequestContext
  ): Promise<Partial<Contract>> {
    const contract = await super.findById(id, context);
    if (!contract) throw new NotFoundException('Contract not found');
    const updateData: any = { eInvoice: { ...eInvoice, linkedAt: new Date() } };
    if (eInvoiceRawData !== undefined) updateData.eInvoiceRawData = eInvoiceRawData;
    return super.update(id, updateData, context);
  }

  /**
   * Internal — used by ContractAnnexService to verify contract existence + org ownership.
   */
  async getRawContractById(contractId: string): Promise<any> {
    return this.contractModel.findOne({ _id: contractId, isDeleted: { $ne: true } }).lean();
  }
}
