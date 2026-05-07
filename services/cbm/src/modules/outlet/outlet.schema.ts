import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type OutletDocument = Outlet & MongooseDocument;

export enum OutletStatus {
  Active = 'active',
  Inactive = 'inactive',
}

@Schema({ timestamps: true, collection: 'outlets' })
export class Outlet extends BaseSchema {
  @Prop({ required: true, maxlength: 200 })
  name!: string;

  @Prop({ maxlength: 500 })
  address?: string;

  @Prop({ maxlength: 50 })
  phone?: string;

  @Prop({ type: String, enum: OutletStatus, default: OutletStatus.Active })
  status!: OutletStatus;
}

export const OutletSchema = SchemaFactory.createForClass(Outlet);

OutletSchema.index({ 'owner.orgId': 1 });
OutletSchema.index({ status: 1 });
OutletSchema.index({ createdAt: 1 });
