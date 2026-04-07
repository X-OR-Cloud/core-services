import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ContactDocument = Contact & MongooseDocument;

export interface PlatformLink {
  platform: string; // 'discord' | 'telegram' | 'zalo' | 'slack' | 'whatsapp' | ...
  platformUserId: string;
  platformUsername?: string;
}

/**
 * Contact - Individual person entity (customer, partner contact, vendor rep)
 * Uses MongoDB _id as the primary identifier
 */
@Schema({ timestamps: true })
export class Contact extends BaseSchema {
  @Prop({ required: true, maxlength: 200 })
  name!: string;

  @Prop({
    type: [String],
    enum: ['customer', 'partner', 'vendor'],
    default: [],
  })
  types!: string[]; // multi-value: e.g. ['customer', 'partner']

  @Prop({ type: String })
  companyId?: string; // ref: Company (optional — freelancer / individual contact)

  @Prop({ maxlength: 200 })
  email?: string;

  @Prop({ maxlength: 50 })
  phone?: string;

  @Prop({ maxlength: 100 })
  jobTitle?: string;

  @Prop({ maxlength: 200 })
  address?: string;

  @Prop({
    type: [
      {
        _id: false,
        platform: { type: String, required: true },
        platformUserId: { type: String, required: true },
        platformUsername: { type: String },
      },
    ],
    default: [],
  })
  platformLinks!: PlatformLink[]; // chat platform identity links (Discord, Telegram, Zalo...)

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

export const ContactSchema = SchemaFactory.createForClass(Contact);

// Indexes for performance
ContactSchema.index({ status: 1 });
ContactSchema.index({ types: 1 });
ContactSchema.index({ companyId: 1 });
ContactSchema.index({ tags: 1 });
ContactSchema.index({ 'platformLinks.platform': 1, 'platformLinks.platformUserId': 1 });
ContactSchema.index({ 'owner.orgId': 1 });
ContactSchema.index({ createdAt: -1 });
ContactSchema.index({ name: 'text', email: 'text', notes: 'text' }); // Full-text search
