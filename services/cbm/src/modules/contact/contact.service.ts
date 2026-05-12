import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import {
  BaseService,
  FindManyOptions,
  FindManyResult,
  buildSearchFilter,
} from '@hydrabyte/base';
import { RequestContext, PredefinedRole, getHighestRole } from '@hydrabyte/shared';
import { isSuperAdmin } from '../project/project-access.helper';
import { Contact, PlatformLink } from './contact.schema';

/**
 * Read access for contacts: org owners (full) + org editors/viewers (read-only).
 */
function canReadContacts(context: RequestContext): boolean {
  if (isSuperAdmin(context)) return true;
  const role = getHighestRole(context.roles);
  return role === PredefinedRole.OrganizationEditor || role === PredefinedRole.OrganizationViewer;
}

/**
 * ContactService
 * Manages contact entities with org-scoped CRUD and statistics.
 * F-014: owner-only access, soft-delete via status:inactive, default filter status:active
 */
@Injectable()
export class ContactService extends BaseService<Contact> {
  constructor(
    @InjectModel(Contact.name) private contactModel: Model<Contact>
  ) {
    super(contactModel);
  }

  /**
   * Override findAll: owner-only, default status:active filter, search support.
   */
  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<Contact>> {
    if (!canReadContacts(context)) {
      throw new ForbiddenException('Only organization owners can access contacts');
    }

    // Default: only active contacts
    options.filter = { status: 'active', ...(options.filter || {}) };

    const { search, ...rest } = options;
    if (search) {
      const searchFilter = buildSearchFilter('searchText', search);
      if (searchFilter) {
        rest.filter = { ...(rest.filter || {}), ...searchFilter };
      }
    }
    options = rest;

    const findResult = await super.findAll(options, context);

    const baseMatch: any = { isDeleted: false, status: 'active' };
    if (context.orgId) baseMatch['owner.orgId'] = context.orgId;

    const statusStats = await super.aggregate(
      [{ $match: baseMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }],
      context
    );

    const statistics: any = { total: findResult.pagination.total, byStatus: {} };
    statusStats.forEach((stat: any) => { statistics.byStatus[stat._id] = stat.count; });

    findResult.statistics = statistics;
    return findResult;
  }

  async create(data: any, context: RequestContext): Promise<Partial<Contact>> {
    if (!isSuperAdmin(context)) {
      throw new ForbiddenException('Only organization owners can manage contacts');
    }
    // Default types to ['customer'] if not provided
    if (!data.types || data.types.length === 0) {
      data.types = ['customer'];
    }
    return super.create(data, context);
  }

  async findById(id: ObjectId, context: RequestContext): Promise<Partial<Contact>> {
    if (!canReadContacts(context)) {
      throw new ForbiddenException('Only organization owners can access contacts');
    }
    const contact = await super.findById(id, context);
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<Contact>> {
    if (!isSuperAdmin(context)) {
      throw new ForbiddenException('Only organization owners can manage contacts');
    }
    const contact = await super.findById(id, context);
    if (!contact) throw new NotFoundException('Contact not found');
    return super.update(id, data, context);
  }

  /**
   * Soft delete via status:inactive (not isDeleted=true).
   * F-020 dedup can still find inactive contacts by phone.
   */
  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Contact>> {
    if (!isSuperAdmin(context)) {
      throw new ForbiddenException('Only organization owners can manage contacts');
    }
    const contact = await super.findById(id, context);
    if (!contact) throw new NotFoundException('Contact not found');
    return super.update(id, { status: 'inactive' }, context);
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
