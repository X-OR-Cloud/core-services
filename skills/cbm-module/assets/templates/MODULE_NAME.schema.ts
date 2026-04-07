import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

// TODO: Define interfaces for nested objects here
// export interface MODULE_CLASSAddress {
//   street?: string;
//   city?: string;
//   country?: string;
// }

@Schema({ timestamps: true })
export class MODULE_CLASS extends BaseSchema {
  // ==============================
  // TODO: Add fields below
  // ==============================

  @Prop({ required: true })
  name: string;

  // String enum with default
  // @Prop({ type: String, enum: ['active', 'inactive'], default: 'active' })
  // status: string;

  // Array of strings
  // @Prop({ type: [String], default: [] })
  // tags: string[];

  // Optional string
  // @Prop({ type: String })
  // notes?: string;

  // Reference ID (store as string)
  // @Prop({ type: String })
  // relatedEntityId?: string;

  // Monetary amount
  // @Prop({ type: Object })
  // amount?: { currency: string; value: number };

  // Nested object — always type: Object, NEVER required inside
  // @Prop({ type: Object })
  // address?: MODULE_CLASSAddress;

  // Array of objects
  // @Prop({ type: [Object], default: [] })
  // items: SomeInterface[];

  // Date field
  // @Prop({ type: Date })
  // dueDate?: Date;
}

export type MODULE_CLASSDocument = MODULE_CLASS & Document;
export const MODULE_CLASSSchema = SchemaFactory.createForClass(MODULE_CLASS);

// Indexes
MODULE_CLASSSchema.index({ 'owner.orgId': 1, createdAt: -1 });
// MODULE_CLASSSchema.index({ name: 'text', notes: 'text' }); // if search on text fields
// MODULE_CLASSSchema.index({ status: 1 });
