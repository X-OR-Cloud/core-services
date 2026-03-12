import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { Organization } from './organization.schema';
import { RequestContext } from '@hydrabyte/shared';
import { LicenseService } from '../license/license.service';
import { IamEventProducer } from '../../queues/producers/iam-event.producer';

@Injectable()
export class OrganizationsService extends BaseService<Organization> {
  constructor(
    @InjectModel(Organization.name) OrganizationModel: Model<Organization>,
    private readonly licenseService: LicenseService,
    @Optional() private readonly iamEventProducer: IamEventProducer,
  ) {
    super(OrganizationModel);
  }

  /**
   * Override create to auto-create default licenses for new organizations
   */
  async create(data: Partial<Organization>, context: RequestContext): Promise<Partial<Organization>> {
    const organization = await super.create(data, context);

    // Create default licenses for the new organization
    if (organization && '_id' in organization) {
      try {
        await this.licenseService.createDefaultLicenses(
          {
            orgId: (organization as any)._id.toString(),
            notes: 'Default licenses - created automatically',
          },
          context
        );
        console.log(`[Organization] Created default licenses for org ${(organization as any)._id}`);
      } catch (error: any) {
        console.error('[Organization] Failed to create default licenses:', error.message);
        // Don't fail organization creation if license creation fails
      }
    }

    // const orgId = (organization as { _id?: { toString(): string } })._id?.toString();
    // if (orgId) {
    //   await this.iamEventProducer?.emitOrganizationCreated({
    //     orgId,
    //     name: (organization as { name?: string }).name ?? '',
    //     createdBy: context.userId,
    //   });
    // }

    return organization;
  }

  async findAll(
    options: FindManyOptions,
    context: RequestContext
  ): Promise<FindManyResult<Organization>> {
    if (options.filter) {
      if (options.filter.search) {
        options.filter.$or = [
          { name: { $regex: options.filter.search, $options: 'i' } },
          { description: { $regex: options.filter.search, $options: 'i' } },
        ];
        delete options.filter.search;
      }
    }
    const findResult = await super.findAll(options, context);

    // Exclude content field from results to reduce response size
    findResult.data = findResult.data.map((doc: any) => {
      // Convert Mongoose document to plain object
      const plainDoc = doc.toObject ? doc.toObject() : doc;
      const { content, ...rest } = plainDoc;
      return rest as Organization;
    });

    // Aggregate statistics by status
    const statusStats = await super.aggregate(
      [
        { $match: { ...options.filter } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ],
      context
    );

    // Aggregate statistics by type
    const typeStats = await super.aggregate(
      [
        { $match: { ...options.filter } },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
          },
        },
      ],
      context
    );

    // Build statistics object
    const statistics: any = {
      total: findResult.pagination.total,
      byStatus: {},
      byType: {},
    };

    // Map status statistics
    statusStats.forEach((stat: any) => {
      statistics.byStatus[stat._id] = stat.count;
    });

    // Map type statistics
    typeStats.forEach((stat: any) => {
      statistics.byType[stat._id] = stat.count;
    });

    findResult.statistics = statistics;
    return findResult;
  }
}
