import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OnApplicationBootstrap } from '@nestjs/common';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { DomainConfig } from './domain-config.schema';

export interface OrderActionDef {
  label: string;
  from: string[];
  to: string;
}

export interface OrderResourceConfig {
  states: string[];
  actions: Record<string, OrderActionDef>;
  metadataFields?: any[];
}

const DEFAULT_ORDER_CONFIG: OrderResourceConfig = {
  states: ['new', 'processing', 'deposited', 'active', 'done', 'cancelled'],
  actions: {
    start:    { label: 'Xử lý',    from: ['new'],                                      to: 'processing' },
    confirm:  { label: 'Xác nhận', from: ['new', 'processing'],                        to: 'deposited'  },
    activate: { label: 'Kích hoạt',from: ['new', 'processing', 'deposited'],            to: 'active'     },
    complete: { label: 'Hoàn tất', from: ['new', 'processing', 'deposited', 'active'],  to: 'done'       },
    cancel:   { label: 'Hủy',      from: ['new', 'processing', 'deposited', 'active'],  to: 'cancelled'  },
  },
};

const BOOKING_ORDER_CONFIG: OrderResourceConfig = {
  states: ['new', 'deposited', 'active', 'done', 'cancelled'],
  actions: {
    confirm:  { label: 'Đặt cọc',    from: ['new'],               to: 'deposited' },
    activate: { label: 'Check-in',   from: ['new', 'deposited'],  to: 'active'    },
    complete: { label: 'Check-out',  from: ['active'],            to: 'done'      },
    cancel:   { label: 'Hủy phòng', from: ['new', 'deposited'],  to: 'cancelled' },
  },
};

const SALE_ORDER_CONFIG: OrderResourceConfig = {
  states: ['new', 'processing', 'done', 'cancelled'],
  actions: {
    start:    { label: 'Bắt đầu', from: ['new'],               to: 'processing' },
    complete: { label: 'Xong',    from: ['new', 'processing'], to: 'done'       },
    cancel:   { label: 'Hủy',    from: ['new', 'processing'], to: 'cancelled'  },
  },
};

const SYSTEM_OWNER = { orgId: '', userId: '', groupId: '', agentId: '', appId: '' };
const SYSTEM_ACTOR = { userId: '', roles: [], orgId: '', groupId: '', agentId: '', appId: '' };

@Injectable()
export class DomainConfigService extends BaseService<DomainConfig> implements OnApplicationBootstrap {
  constructor(@InjectModel(DomainConfig.name) private readonly domainConfigModel: Model<DomainConfig>) {
    super(domainConfigModel);
  }

  async onApplicationBootstrap() {
    await this.seedPresets();
  }

  private async seedPresets() {
    const presets = [
      { domain: 'default', resource: 'order', config: DEFAULT_ORDER_CONFIG },
      { domain: 'booking', resource: 'order', config: BOOKING_ORDER_CONFIG },
      { domain: 'sale',    resource: 'order', config: SALE_ORDER_CONFIG    },
    ];

    for (const preset of presets) {
      await this.domainConfigModel.findOneAndUpdate(
        { domain: preset.domain, resource: preset.resource, isPreset: true },
        {
          $setOnInsert: {
            domain: preset.domain,
            resource: preset.resource,
            isPreset: true,
            config: preset.config,
            owner: SYSTEM_OWNER,
            createdBy: SYSTEM_ACTOR,
            updatedBy: SYSTEM_ACTOR,
          },
        },
        { upsert: true, new: false },
      );
    }
  }

  async getOrderConfig(orgId: string): Promise<OrderResourceConfig> {
    if (orgId) {
      const orgConfig = await this.domainConfigModel
        .findOne({ 'owner.orgId': orgId, resource: 'order', isPreset: false, isDeleted: { $ne: true } })
        .lean();
      if (orgConfig) return orgConfig.config as OrderResourceConfig;
    }

    const defaultPreset = await this.domainConfigModel
      .findOne({ domain: 'default', resource: 'order', isPreset: true })
      .lean();
    if (defaultPreset) return defaultPreset.config as OrderResourceConfig;

    return DEFAULT_ORDER_CONFIG;
  }

  async createOrgConfig(data: any, context: RequestContext): Promise<DomainConfig> {
    const existing = await this.domainConfigModel.findOne({
      'owner.orgId': context.orgId,
      resource: data.resource,
      isPreset: false,
      isDeleted: { $ne: true },
    });
    if (existing) {
      throw new BadRequestException(`Org config for resource '${data.resource}' already exists. Use PATCH to update.`);
    }
    return super.create({ ...data, isPreset: false }, context) as any;
  }

  async deleteOrgConfig(id: any, context: RequestContext): Promise<DomainConfig> {
    const doc = await this.domainConfigModel.findById(id).lean();
    if (!doc) throw new NotFoundException('DomainConfig not found');
    if (doc.isPreset) throw new ForbiddenException('System presets cannot be deleted');
    return super.softDelete(id, context) as any;
  }
}
