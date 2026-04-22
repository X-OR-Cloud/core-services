import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { ContractAnnex } from './contract-annex.schema';
import { ContractService } from '../contract/contract.service';
import { EInvoiceLink } from '../invoice/invoice.schema';

/**
 * ContractAnnexService
 * Manages annexes attached to contracts.
 *
 * State machine:
 *   draft → active → cancelled
 *   cancelled → draft (reopen)
 *
 * Code auto-generated per contract: PL01, PL02, PL03, ...
 */
@Injectable()
export class ContractAnnexService extends BaseService<ContractAnnex> {
  constructor(
    @InjectModel(ContractAnnex.name) private annexModel: Model<ContractAnnex>,
    private readonly contractService: ContractService
  ) {
    super(annexModel);
  }

  /**
   * Override create — validate contract exists + same org, auto-generate code per contract.
   */
  async create(data: any, context: RequestContext): Promise<Partial<ContractAnnex>> {
    const contract = await this.contractService.getRawContractById(data.contractId);
    if (!contract) throw new NotFoundException('Contract not found');
    if (context.orgId && contract.owner?.orgId !== context.orgId) {
      throw new BadRequestException('Contract does not belong to your organization');
    }

    data.status = 'draft';
    data.code = await this.generateCode(data.contractId);
    return super.create(data, context);
  }

  /**
   * Generate next annex code per contract.
   * Format: PL01, PL02, PL03, ...
   */
  private async generateCode(contractId: string): Promise<string> {
    const count = await this.annexModel.countDocuments({
      contractId,
      isDeleted: { $ne: true },
    });
    const seq = count + 1;
    return `PL${String(seq).padStart(2, '0')}`;
  }

  /**
   * findAll with search + statistics (total + byStatus).
   * Requires contractId filter to scope to a specific contract.
   */
  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<ContractAnnex>> {
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

    const statusStats = await super.aggregate(
      [{ $match: matchFilter }, { $group: { _id: '$status', count: { $sum: 1 } } }],
      context
    );

    const statistics: any = { total: findResult.pagination.total, byStatus: {} };
    statusStats.forEach((s: any) => { statistics.byStatus[s._id] = s.count; });

    findResult.statistics = statistics;
    return findResult;
  }

  async findById(id: ObjectId, context: RequestContext): Promise<Partial<ContractAnnex>> {
    const annex = await super.findById(id, context);
    if (!annex) throw new NotFoundException('Contract annex not found');
    return annex;
  }

  /**
   * Update allowed in draft status only.
   */
  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<ContractAnnex>> {
    const annex = await super.findById(id, context);
    if (!annex) throw new NotFoundException('Contract annex not found');
    if (annex.status !== 'draft') {
      throw new BadRequestException(`Annex can only be updated in draft status (current: ${annex.status})`);
    }
    return super.update(id, data, context);
  }

  /**
   * Soft delete allowed in draft or cancelled status.
   */
  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<ContractAnnex>> {
    const annex = await super.findById(id, context);
    if (!annex) throw new NotFoundException('Contract annex not found');
    if (!['draft', 'cancelled'].includes(annex.status)) {
      throw new BadRequestException(
        `Annex can only be deleted in draft or cancelled status (current: ${annex.status})`
      );
    }
    return super.softDelete(id, context);
  }

  // ========== State machine ==========

  async activate(id: ObjectId, context: RequestContext): Promise<Partial<ContractAnnex>> {
    const annex = await super.findById(id, context);
    if (!annex) throw new NotFoundException('Contract annex not found');
    if (annex.status !== 'draft') {
      throw new BadRequestException(`Annex must be in draft status to activate (current: ${annex.status})`);
    }
    return super.update(id, { status: 'active' }, context);
  }

  async cancel(id: ObjectId, context: RequestContext): Promise<Partial<ContractAnnex>> {
    const annex = await super.findById(id, context);
    if (!annex) throw new NotFoundException('Contract annex not found');
    if (annex.status === 'cancelled') {
      throw new BadRequestException('Annex is already cancelled');
    }
    return super.update(id, { status: 'cancelled' }, context);
  }

  async reopen(id: ObjectId, context: RequestContext): Promise<Partial<ContractAnnex>> {
    const annex = await super.findById(id, context);
    if (!annex) throw new NotFoundException('Contract annex not found');
    if (annex.status !== 'cancelled') {
      throw new BadRequestException(`Annex must be cancelled to reopen (current: ${annex.status})`);
    }
    return super.update(id, { status: 'draft' }, context);
  }

  async linkEInvoice(
    id: ObjectId,
    eInvoice: Partial<EInvoiceLink>,
    eInvoiceRawData: Record<string, any> | undefined,
    context: RequestContext
  ): Promise<Partial<ContractAnnex>> {
    const annex = await super.findById(id, context);
    if (!annex) throw new NotFoundException('Contract annex not found');
    const updateData: any = { eInvoice: { ...eInvoice, linkedAt: new Date() } };
    if (eInvoiceRawData !== undefined) updateData.eInvoiceRawData = eInvoiceRawData;
    return super.update(id, updateData, context);
  }
}
