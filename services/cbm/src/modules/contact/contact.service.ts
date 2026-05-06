import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import {
  BaseService,
  FindManyOptions,
  FindManyResult,
  buildSearchFilter,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Contact, PlatformLink } from './contact.schema';

/**
 * ContactService
 * Manages contact entities with org-scoped CRUD and statistics.
 * Extends BaseService for automatic CRUD operations.
 *
 * Phase 3 additions: activate/deactivate, platform-links sub-endpoints
 */
@Injectable()
export class ContactService extends BaseService<Contact> {
  constructor(
    @InjectModel(Contact.name) private contactModel: Model<Contact>
  ) {
    super(contactModel);
  }

  /**
   * Override findAll with search support and statistics aggregation.
   */
  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<Contact>> {
    const { search, ...rest } = options;
    if (search) {
      const searchFilter = buildSearchFilter('searchText', search);
      if (searchFilter) {
        rest.filter = { ...(rest.filter || {}), ...searchFilter };
      }
    }
    options = rest;

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

  async findById(id: ObjectId, context: RequestContext): Promise<Partial<Contact>> {
    const contact = await super.findById(id, context);
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<Contact>> {
    const contact = await super.findById(id, context);
    if (!contact) throw new NotFoundException('Contact not found');
    return super.update(id, data, context);
  }

  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Contact>> {
    const contact = await super.findById(id, context);
    if (!contact) throw new NotFoundException('Contact not found');
    return super.softDelete(id, context);
  }

  // =============== Phase 3: Platform Links ===============

  async addPlatformLink(
    id: ObjectId,
    link: PlatformLink,
    context: RequestContext
  ): Promise<Contact> {
    const contact = await super.findById(id, context);
    if (!contact) throw new NotFoundException('Contact not found');

    const exists = contact.platformLinks?.some(
      (l) => l.platform === link.platform && l.platformUserId === link.platformUserId
    );
    if (exists) throw new ConflictException(`Platform link already exists for ${link.platform}:${link.platformUserId}`);

    await this.contactModel.updateOne(
      { _id: id },
      { $push: { platformLinks: link } }
    );

    return this.contactModel.findById(id).lean() as any;
  }

  async removePlatformLink(
    id: ObjectId,
    platform: string,
    platformUserId: string,
    context: RequestContext
  ): Promise<Contact> {
    const contact = await super.findById(id, context);
    if (!contact) throw new NotFoundException('Contact not found');

    const exists = contact.platformLinks?.some(
      (l) => l.platform === platform && l.platformUserId === platformUserId
    );
    if (!exists) throw new BadRequestException(`Platform link not found for ${platform}:${platformUserId}`);

    await this.contactModel.updateOne(
      { _id: id },
      { $pull: { platformLinks: { platform, platformUserId } } }
    );

    return this.contactModel.findById(id).lean() as any;
  }
}
