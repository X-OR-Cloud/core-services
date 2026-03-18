import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext, PredefinedRole } from '@hydrabyte/shared';
import { RiskProfile } from './risk-profile.schema';

@Injectable()
export class RiskProfileService extends BaseService<RiskProfile> {
  constructor(
    @InjectModel(RiskProfile.name) riskProfileModel: Model<RiskProfile>,
  ) {
    super(riskProfileModel as any);
  }

  private isOrgOwner(context: RequestContext): boolean {
    return (
      context.roles?.includes(PredefinedRole.OrganizationOwner) ||
      context.roles?.includes(PredefinedRole.UniverseOwner)
    );
  }

  private async verifyOwnership(id: any, context: RequestContext): Promise<void> {
    const existing = await super.findById(id, context);
    if (existing?.owner?.userId !== context.userId) {
      throw new ForbiddenException('Access denied');
    }
  }

  async findAll(options: FindManyOptions, context: RequestContext): Promise<FindManyResult<RiskProfile>> {
    if (!this.isOrgOwner(context)) {
      options.filter = { ...(options.filter || {}), 'owner.userId': context.userId };
    }
    return super.findAll(options, context);
  }

  async findById(id: any, context: RequestContext): Promise<Partial<RiskProfile>> {
    const result = await super.findById(id, context);
    if (!this.isOrgOwner(context) && result?.owner?.userId !== context.userId) {
      throw new ForbiddenException('Access denied');
    }
    return result;
  }

  async update(id: any, dto: any, context: RequestContext): Promise<Partial<RiskProfile>> {
    if (!this.isOrgOwner(context)) {
      await this.verifyOwnership(id, context);
    }
    return super.update(id, dto, context);
  }

  async softDelete(id: any, context: RequestContext): Promise<Partial<RiskProfile>> {
    if (!this.isOrgOwner(context)) {
      await this.verifyOwnership(id, context);
    }
    return super.softDelete(id, context);
  }
}
