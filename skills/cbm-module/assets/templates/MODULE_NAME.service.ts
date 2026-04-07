import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { MODULE_CLASS } from './MODULE_NAME.schema';
// import { OtherService } from '../other/other.service'; // if cross-module dependency

/**
 * MODULE_CLASSService
 *
 * TODO: Add description of what this module manages.
 */
@Injectable()
export class MODULE_CLASSService extends BaseService<MODULE_CLASS> {
  constructor(
    @InjectModel(MODULE_CLASS.name) private MODULE_NAMEModel: Model<MODULE_CLASS>
    // private readonly otherService: OtherService, // if cross-module dependency
  ) {
    super(MODULE_NAMEModel);
  }

  /**
   * Override findAll — org-scoped + search support + statistics.
   */
  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<MODULE_CLASS>> {
    // Apply text search
    if (options.search) {
      const searchRegex = new RegExp(options.search, 'i');
      const searchConditions = [
        { name: searchRegex },
        // TODO: add more searchable fields
        // { notes: searchRegex },
        // { vendorName: searchRegex },
      ];
      options = { ...options, $or: searchConditions } as any;
    }
    delete options.search;

    const findResult = await super.findAll(options, context);

    // Statistics aggregation
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

  async findById(id: ObjectId, context: RequestContext): Promise<MODULE_CLASS> {
    const entity = await super.findById(id, context);
    if (!entity) throw new NotFoundException('MODULE_CLASS not found');
    return entity;
  }

  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<MODULE_CLASS>> {
    const entity = await super.findById(id, context);
    if (!entity) throw new NotFoundException('MODULE_CLASS not found');
    // TODO: add status guard if needed
    // if (!['draft', 'pending'].includes(entity.status)) {
    //   throw new BadRequestException(`Cannot update in status: ${entity.status}`);
    // }
    return super.update(id, data, context);
  }

  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<MODULE_CLASS>> {
    const entity = await super.findById(id, context);
    if (!entity) throw new NotFoundException('MODULE_CLASS not found');
    // TODO: add status guard if needed
    // if (!['draft', 'cancelled'].includes(entity.status)) {
    //   throw new BadRequestException(`Cannot delete in status: ${entity.status}`);
    // }
    return super.softDelete(id, context);
  }

  // =============== TODO: State machine actions (if applicable) ===============
  // See references/state-machine.md for patterns

  // async activate(id: ObjectId, context: RequestContext): Promise<Partial<MODULE_CLASS>> {
  //   const entity = await super.findById(id, context);
  //   if (!entity) throw new NotFoundException('MODULE_CLASS not found');
  //   if (entity.status === 'active') {
  //     throw new BadRequestException('MODULE_CLASS is already active');
  //   }
  //   return super.update(id, { status: 'active' }, context);
  // }

  // async deactivate(id: ObjectId, context: RequestContext): Promise<Partial<MODULE_CLASS>> {
  //   const entity = await super.findById(id, context);
  //   if (!entity) throw new NotFoundException('MODULE_CLASS not found');
  //   if (entity.status === 'inactive') {
  //     throw new BadRequestException('MODULE_CLASS is already inactive');
  //   }
  //   return super.update(id, { status: 'inactive' }, context);
  // }
}
