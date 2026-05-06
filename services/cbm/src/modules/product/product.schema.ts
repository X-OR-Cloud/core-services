import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema, normalizeSearchText } from '@hydrabyte/base';
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

  @Prop({ type: String })
  searchText?: string; // normalized name + code for diacritic-insensitive search
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.pre('save', function (next) {
  const doc = this as any;
  if (doc.isModified('name') || doc.isModified('code') || !doc.searchText) {
    doc.searchText = [normalizeSearchText(doc.name), normalizeSearchText(doc.code)]
      .filter(Boolean)
      .join(' ');
  }
  next();
});

ProductSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() as any;
  if (!update) return next();
  const $set = update.$set || update;
  const name = $set.name;
  const code = $set.code;
  if (name === undefined && code === undefined) return next();
  this.model
    .findOne(this.getFilter())
    .lean()
    .then((existing: any) => {
      const finalName = name !== undefined ? name : existing?.name;
      const finalCode = code !== undefined ? code : existing?.code;
      const searchText = [
        normalizeSearchText(finalName),
        normalizeSearchText(finalCode),
      ]
        .filter(Boolean)
        .join(' ');
      if (update.$set) update.$set.searchText = searchText;
      else update.searchText = searchText;
      next();
    })
    .catch(next);
});

ProductSchema.index({ code: 1, 'owner.orgId': 1 }, { unique: true });
ProductSchema.index({ categoryId: 1 });
ProductSchema.index({ status: 1 });
ProductSchema.index({ 'owner.orgId': 1 });
ProductSchema.index({ createdAt: -1 });
ProductSchema.index({ 'owner.orgId': 1, searchText: 1 });
