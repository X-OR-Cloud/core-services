import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId, ObjectId } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Outlet, OutletStatus } from './outlet.schema';
import { OutletMember } from '../outlet-member/outlet-member.schema';

export interface OutletListResult {
  outlets: Partial<Outlet>[];
  defaultOutletId: string | null;
}

@Injectable()
export class OutletService extends BaseService<Outlet> {
  constructor(
    @InjectModel(Outlet.name) private outletModel: Model<Outlet>,
    @InjectModel(OutletMember.name) private outletMemberModel: Model<OutletMember>,
  ) {
    super(outletModel);
  }

  /**
   * GET /outlets — returns outlets accessible to current user + defaultOutletId.
   * - organization.owner: all active outlets in org
   * - organization.editor: only outlets assigned via OutletMember
   */
  async getOutletsForUser(context: RequestContext): Promise<OutletListResult> {
    const isOwner = context.roles.some((r) => r === 'organization.owner' || r === 'universe.owner');

    let outlets: Partial<Outlet>[];
    let defaultOutletId: string | null = null;

    if (isOwner) {
      // Owner sees all active outlets in org
      const docs = await this.outletModel
        .find({
          'owner.orgId': context.orgId,
          status: OutletStatus.Active,
          isDeleted: false,
        })
        .sort({ createdAt: 1 })
        .lean();

      outlets = docs;

      // Determine default: look for OutletMember record with isDefault = true
      const defaultMember = await this.outletMemberModel.findOne({
        userId: context.userId,
        'owner.orgId': context.orgId,
        isDefault: true,
        isDeleted: false,
      }).lean();

      if (defaultMember) {
        defaultOutletId = defaultMember.outletId.toString();
      } else if (docs.length > 0) {
        // Fallback: first outlet
        defaultOutletId = (docs[0] as any)._id.toString();
      }
    } else {
      // Editor: only assigned outlets
      const memberships = await this.outletMemberModel
        .find({
          userId: context.userId,
          'owner.orgId': context.orgId,
          isDeleted: false,
        })
        .lean();

      if (memberships.length === 0) {
        return { outlets: [], defaultOutletId: null };
      }

      const outletIds = memberships.map((m) => m.outletId);
      const docs = await this.outletModel
        .find({
          _id: { $in: outletIds },
          status: OutletStatus.Active,
          isDeleted: false,
        })
        .sort({ createdAt: 1 })
        .lean();

      outlets = docs;

      // Determine default
      const defaultMember = memberships.find((m) => m.isDefault);
      if (defaultMember) {
        defaultOutletId = defaultMember.outletId.toString();
      } else if (docs.length === 1) {
        defaultOutletId = (docs[0] as any)._id.toString();
      }
    }

    return { outlets, defaultOutletId };
  }

  override async findById(id: string | ObjectId, context: RequestContext): Promise<Partial<Outlet>> {
    const outlet = await super.findById(id, context);
    if (!outlet) throw new NotFoundException('Outlet not found');
    return outlet;
  }

  override async update(id: string | ObjectId, data: any, context: RequestContext): Promise<Partial<Outlet>> {
    const outlet = await super.findById(id, context);
    if (!outlet) throw new NotFoundException('Outlet not found');
    return super.update(id, data, context);
  }

  override async softDelete(id: string | ObjectId, context: RequestContext): Promise<Partial<Outlet>> {
    const outlet = await super.findById(id, context);
    if (!outlet) throw new NotFoundException('Outlet not found');
    return super.softDelete(id, context);
  }

  async activate(id: string | ObjectId, context: RequestContext): Promise<Partial<Outlet>> {
    const outlet = await super.findById(id, context);
    if (!outlet) throw new NotFoundException('Outlet not found');
    if (outlet.status === OutletStatus.Active)
      throw new BadRequestException('Outlet is already active');
    return super.update(id, { status: OutletStatus.Active }, context);
  }

  async deactivate(id: string | ObjectId, context: RequestContext): Promise<Partial<Outlet>> {
    const outlet = await super.findById(id, context);
    if (!outlet) throw new NotFoundException('Outlet not found');
    if (outlet.status === OutletStatus.Inactive)
      throw new BadRequestException('Outlet is already inactive');
    return super.update(id, { status: OutletStatus.Inactive }, context);
  }

  /**
   * Validate that an outletId belongs to the current org and is active.
   * Used by other services when reading x-outlet-id header.
   */
  async validateOutletAccess(outletId: string, context: RequestContext): Promise<void> {
    if (!isValidObjectId(outletId)) {
      throw new BadRequestException('Invalid x-outlet-id');
    }

    const outlet = await this.outletModel.findOne({
      _id: new Types.ObjectId(outletId),
      'owner.orgId': context.orgId,
      isDeleted: false,
    }).lean();

    if (!outlet) {
      throw new ForbiddenException('Outlet not found or access denied');
    }

    if (outlet.status !== OutletStatus.Active) {
      throw new BadRequestException('Outlet is inactive');
    }

    // For editors: also check OutletMember assignment
    const isOwner = context.roles.some((r) => r === 'organization.owner' || r === 'universe.owner');
    if (!isOwner) {
      const membership = await this.outletMemberModel.findOne({
        userId: context.userId,
        outletId: new Types.ObjectId(outletId),
        'owner.orgId': context.orgId,
        isDeleted: false,
      }).lean();

      if (!membership) {
        throw new ForbiddenException('You do not have access to this outlet');
      }
    }
  }
}
