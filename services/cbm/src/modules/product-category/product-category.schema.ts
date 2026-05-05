import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ProductCategoryDocument = ProductCategory & MongooseDocument;

@Schema({ timestamps: true, collection: 'product_categories' })
export class ProductCategory extends BaseSchema {
  @Prop({ required: true, maxlength: 200 })
  name!: string;

  @Prop({ maxlength: 2000 })
  note?: string;

  @Prop({ required: true, enum: ['active', 'inactive'], default: 'active' })
  status!: string;
}

export const ProductCategorySchema = SchemaFactory.createForClass(ProductCategory);

ProductCategorySchema.index({ 'owner.orgId': 1 });
ProductCategorySchema.index({ status: 1 });
ProductCategorySchema.index({ createdAt: -1 });
ProductCategorySchema.index({ name: 'text' });
