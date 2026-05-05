import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { MoneyAmount } from '../../shared-types/money.types';

export type ProductDocument = Product & MongooseDocument;

@Schema({ timestamps: true, collection: 'products' })
export class Product extends BaseSchema {
  @Prop({ required: true, maxlength: 50 })
  code!: string;

  @Prop({ required: true, maxlength: 200 })
  name!: string;

  @Prop({ type: String })
  categoryId?: string; // ref: ProductCategory

  @Prop({ required: true, type: Object })
  price!: MoneyAmount;

  @Prop({ required: true, type: Number, default: 0 })
  taxRate!: number; // percentage, e.g. 8 = 8%

  @Prop({ required: true, enum: ['active', 'inactive'], default: 'active' })
  status!: string;

  @Prop({ maxlength: 2000 })
  note?: string;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index({ code: 1, 'owner.orgId': 1 }, { unique: true });
ProductSchema.index({ categoryId: 1 });
ProductSchema.index({ status: 1 });
ProductSchema.index({ 'owner.orgId': 1 });
ProductSchema.index({ createdAt: -1 });
ProductSchema.index({ name: 'text', code: 'text' });
