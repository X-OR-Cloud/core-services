import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { OutletMember } from './outlet-member.schema';
import { CreateOutletMemberDto, UpdateOutletMemberDto } from './outlet-member.dto';

@Injectable()
export class OutletMemberService extends BaseService<OutletMember> {
  constructor(
    @InjectModel(OutletMember.name) private outletMemberModel: Model<OutletMember>,
  ) {
    super(outletMemberModel);
  }

  /**
   * Assign a user to an outlet.
   * If this is the first assignment for the user in this org → auto-set isDefault = true.
   * If isDefault is explicitly true → unset isDefault on all other members for this user.
   */
  async assignMember(
    dto: CreateOutletMemberDto,
    context: RequestContext,
  ): Promise<OutletMember> {
    const outletObjectId = new Types.ObjectId(dto.outletId);

    // Check duplicate
    const existing = await this.outletMemberModel.findOne({
      userId: dto.userId,
      outletId: outletObjectId,
      'owner.orgId': context.orgId,
      isDeleted: false,
    }).lean();

    if (existing) {
      throw new ConflictException('User is already assigned to this outlet');
    }

    // Check if this is the first assignment for this user in org
    const existingCount = await this.outletMemberModel.countDocuments({
      userId: dto.userId,
      'owner.orgId': context.orgId,
      isDeleted: false,
    });

    const shouldBeDefault = dto.isDefault === true || existingCount === 0;

    // If setting as default, clear existing default for this user
    if (shouldBeDefault) {
      await this.outletMemberModel.updateMany(
        { userId: dto.userId, 'owner.orgId': context.orgId, isDefault: true },
        { $set: { isDefault: false } },
      );
    }

    const member = await this.create(
      { outletId: outletObjectId, userId: dto.userId, isDefault: shouldBeDefault } as any,
      context,
    );

    return member as unknown as OutletMember;
  }

  /**
   * Update isDefault flag. When setting isDefault = true, clears all other defaults for same user.
   */
  async updateMember(
    id: Types.ObjectId,
    dto: UpdateOutletMemberDto,
    context: RequestContext,
  ): Promise<Partial<OutletMember>> {
    const member = await this.outletMemberModel.findOne({
      _id: id,
      'owner.orgId': context.orgId,
      isDeleted: false,
    }).lean();

    if (!member) throw new NotFoundException('OutletMember not found');

    if (dto.isDefault === true) {
      // Clear other defaults for this user
      await this.outletMemberModel.updateMany(
        { userId: member.userId, 'owner.orgId': context.orgId, isDefault: true },
        { $set: { isDefault: false } },
      );
    }

    return super.update(id as any, dto, context);
  }

  /**
   * List all members for a specific outlet.
   */
  async listByOutlet(outletId: string, context: RequestContext): Promise<OutletMember[]> {
    if (!isValidObjectId(outletId)) throw new BadRequestException('Invalid outletId');

    const members = await this.outletMemberModel
      .find({
        outletId: new Types.ObjectId(outletId),
        'owner.orgId': context.orgId,
        isDeleted: false,
      })
      .lean();

    return members as unknown as OutletMember[];
  }

  /**
   * List all outlet assignments for a specific user.
   */
  async listByUser(userId: string, context: RequestContext): Promise<OutletMember[]> {
    const members = await this.outletMemberModel
      .find({
        userId,
        'owner.orgId': context.orgId,
        isDeleted: false,
      })
      .lean();

    return members as unknown as OutletMember[];
  }

  async removeMember(id: Types.ObjectId, context: RequestContext): Promise<Partial<OutletMember>> {
    const member = await this.outletMemberModel.findOne({
      _id: id,
      'owner.orgId': context.orgId,
      isDeleted: false,
    }).lean();

    if (!member) throw new NotFoundException('OutletMember not found');
    return super.softDelete(id as any, context);
  }
}
