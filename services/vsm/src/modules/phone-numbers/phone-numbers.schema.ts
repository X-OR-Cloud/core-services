import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type PhoneNumberDocument = PhoneNumber & Document;

@Schema({ timestamps: true, collection: 'phone_numbers' })
export class PhoneNumber extends BaseSchema {
  @Prop({ type: Types.ObjectId, required: true }) nodeId: Types.ObjectId;
  @Prop({ required: true }) number: string; // E.164 format, e.g. +84901234567
  @Prop({ enum: ['inbound', 'outbound', 'both'], default: 'both' }) direction: string;
  @Prop() description?: string;
}

export const PhoneNumberSchema = SchemaFactory.createForClass(PhoneNumber);

PhoneNumberSchema.index({ orgId: 1, number: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
