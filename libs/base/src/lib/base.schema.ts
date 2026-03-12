import { Prop, Schema } from '@nestjs/mongoose';

@Schema()
export abstract class BaseSchema {
  @Prop({ type: Object, default: {} })
  metadata?: Record<string, any> | any;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date = new Date();

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date = new Date();

  @Prop({ type: Date, default: Date.now })
  deletedAt: Date | null = null;

  @Prop({ type: Object, default: {} })
  owner: {
    orgId: string;
    groupId: string;
    userId: string;
    agentId: string;
    appId: string;
  } = { orgId: '', groupId: '', userId: '', agentId: '', appId: '' };

  @Prop({ type: Boolean, default: false })
  isDeleted = false;

  /**
   * User ID who created this record
   * Automatically populated from RequestContext.userId on create
   */
  @Prop({ type: Object, default: {} })
  createdBy = {};

  /**
   * User ID who last updated this record
   * Automatically populated from RequestContext.userId on create/update/delete
   */
  @Prop({ type: Object, default: {} })
  updatedBy = {};
}
