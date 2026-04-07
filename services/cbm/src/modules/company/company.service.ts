import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Company } from './company.schema';

/**
 * CompanyService
 * Manages company entities with org-scoped CRUD and statistics.
 * Extends BaseService for automatic CRUD operations.
 *
 * Phase 3 additions: activate / deactivate action methods
 */
@Injectable()
export class CompanyService extends BaseService<Company> {
  constructor(
    @InjectModel(Company.name) private companyModel: Model<Company>
  ) {
    super(companyModel);
  }

  /**
   * Override findAll with search support and statistics aggregation.
   */
  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<Company>> {
    // Handle search — convert to case-insensitive regex across searchable fields
    const searchQuery = options.search || (options.filter as any)?.search;
    if (searchQuery && typeof searchQuery === 'string') {
      const searchRegex = new RegExp(searchQuery, 'i');
      const searchConditions = [
        { name: searchRegex },
        { taxCode: searchRegex },
        { notes: searchRegex },
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

    // Build base match for aggregation (mirrors BaseService org-scope logic)
    const baseMatch: any = { isDeleted: false };
    if (context.orgId) {
      baseMatch['owner.orgId'] = context.orgId;
    }

    let matchFilter: any;
    if (options.filter && Object.keys(options.filter).length > 0) {
      matchFilter = { $and: [baseMatch, options.filter] };
    } else {
      matchFilter = baseMatch;
    }

    // Aggregate statistics by status
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

  /**
   * Override findById — throws 404 if not found.
   */
  async findById(id: ObjectId, context: RequestContext): Promise<Partial<Company>> {
    const company = await super.findById(id, context);
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  /**
   * Override update — throws 404 if not found.
   */
  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<Company>> {
    const company = await super.findById(id, context);
    if (!company) throw new NotFoundException('Company not found');
    return super.update(id, data, context);
  }

  /**
   * Override softDelete — throws 404 if not found.
   * Phase 3: may add status restriction if needed.
   */
  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Company>> {
    const company = await super.findById(id, context);
    if (!company) throw new NotFoundException('Company not found');
    return super.softDelete(id, context);
  }

  // =============== Phase 3: Action Methods ===============

  async activate(id: ObjectId, context: RequestContext): Promise<Partial<Company>> {
    const company = await super.findById(id, context);
    if (!company) throw new NotFoundException('Company not found');
    if (company.status === 'active') throw new BadRequestException('Company is already active');
    return super.update(id, { status: 'active' }, context);
  }

  async deactivate(id: ObjectId, context: RequestContext): Promise<Partial<Company>> {
    const company = await super.findById(id, context);
    if (!company) throw new NotFoundException('Company not found');
    if (company.status === 'inactive') throw new BadRequestException('Company is already inactive');
    return super.update(id, { status: 'inactive' }, context);
  }
}
