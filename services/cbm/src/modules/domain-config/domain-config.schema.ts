import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type DomainConfigDocument = DomainConfig & MongooseDocument;

@Schema({ timestamps: true, collection: 'domain_configs' })
export class DomainConfig extends BaseSchema {
  @Prop({ required: true, maxlength: 100 })
  domain!: string;

  @Prop({ maxlength: 100 })
  extends?: string;

  @Prop({ required: true, maxlength: 50 })
  resource!: string;

  @Prop({ required: true, default: false })
  isPreset!: boolean;

  @Prop({ required: true, type: Object })
  config!: Record<string, any>;
}

export const DomainConfigSchema = SchemaFactory.createForClass(DomainConfig);

DomainConfigSchema.index({ domain: 1, resource: 1, isPreset: 1 });
DomainConfigSchema.index({ 'owner.orgId': 1, resource: 1 });
