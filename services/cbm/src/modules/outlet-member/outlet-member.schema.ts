import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type OutletMemberDocument = OutletMember & MongooseDocument;

@Schema({ timestamps: true, collection: 'outlet-members' })
export class OutletMember extends BaseSchema {
  @Prop({ type: Types.ObjectId, required: true })
  outletId!: Types.ObjectId;

  @Prop({ required: true })
  userId!: string;

  @Prop({ default: false })
  isDefault!: boolean;
}

export const OutletMemberSchema = SchemaFactory.createForClass(OutletMember);

OutletMemberSchema.index({ 'owner.orgId': 1 });
OutletMemberSchema.index({ userId: 1, 'owner.orgId': 1 });
OutletMemberSchema.index({ outletId: 1, 'owner.orgId': 1 });
OutletMemberSchema.index({ userId: 1, outletId: 1, 'owner.orgId': 1 }, { unique: true });
