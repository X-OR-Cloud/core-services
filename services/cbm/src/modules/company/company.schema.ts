import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type CompanyDocument = Company & MongooseDocument;

export interface CompanyAddress {
  street?: string;
  city?: string;
  province?: string;
  country?: string;
  postalCode?: string;
}

/**
 * Company - External organization entity (customer, partner, vendor)
 * Used as the master template for CRM & Finance modules
 * Uses MongoDB _id as the primary identifier
 */
@Schema({ timestamps: true, collection: 'companies' })
export class Company extends BaseSchema {
  @Prop({ required: true, maxlength: 200 })
  name!: string;

  @Prop({
    type: [String],
    enum: ['customer', 'partner', 'vendor'],
    default: [],
  })
  types!: string[]; // multi-value: e.g. ['customer', 'vendor']

  @Prop({ maxlength: 20 })
  taxCode?: string; // Mã số thuế

  @Prop({ maxlength: 200 })
  website?: string;

  @Prop({ maxlength: 100 })
  industry?: string;

  @Prop({ maxlength: 50 })
  phone?: string;

  @Prop({ maxlength: 200 })
  email?: string;

  @Prop({
    type: {
      _id: false,
      street: { type: String },
      city: { type: String },
      province: { type: String },
      country: { type: String },
      postalCode: { type: String },
    },
  })
  address?: CompanyAddress;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ maxlength: 2000 })
  notes?: string;

  @Prop({
    required: true,
    enum: ['active', 'inactive'],
    default: 'active',
  })
  status!: string;

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
  // _id is automatically provided by MongoDB
}

export const CompanySchema = SchemaFactory.createForClass(Company);

// Indexes for performance
CompanySchema.index({ status: 1 });
CompanySchema.index({ types: 1 });
CompanySchema.index({ tags: 1 });
CompanySchema.index({ 'owner.orgId': 1 });
CompanySchema.index({ createdAt: -1 });
CompanySchema.index({ name: 'text', taxCode: 'text', notes: 'text' }); // Full-text search
