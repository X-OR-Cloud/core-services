import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema, normalizeSearchText } from '@hydrabyte/base';

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
@Schema({ timestamps: true, collection: 'contacts' })
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

  @Prop({ type: String })
  searchText?: string; // normalized name + email + phone + tags for diacritic-insensitive search

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
  // _id is automatically provided by MongoDB
}

export const ContactSchema = SchemaFactory.createForClass(Contact);

function buildContactSearchText(doc: any): string {
  const parts = [
    normalizeSearchText(doc.name),
    normalizeSearchText(doc.email),
    normalizeSearchText(doc.phone),
    normalizeSearchText(doc.notes),
    ...(Array.isArray(doc.tags) ? doc.tags.map(normalizeSearchText) : []),
  ];
  return parts.filter(Boolean).join(' ');
}

ContactSchema.pre('save', function (next) {
  const doc = this as any;
  if (
    doc.isModified('name') ||
    doc.isModified('email') ||
    doc.isModified('phone') ||
    doc.isModified('notes') ||
    doc.isModified('tags') ||
    !doc.searchText
  ) {
    doc.searchText = buildContactSearchText(doc);
  }
  next();
});

ContactSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() as any;
  if (!update) return next();
  const $set = update.$set || update;
  const touched = ['name', 'email', 'phone', 'notes', 'tags'].some(
    (k) => $set[k] !== undefined
  );
  if (!touched) return next();
  this.model
    .findOne(this.getFilter())
    .lean()
    .then((existing: any) => {
      const merged = {
        name: $set.name !== undefined ? $set.name : existing?.name,
        email: $set.email !== undefined ? $set.email : existing?.email,
        phone: $set.phone !== undefined ? $set.phone : existing?.phone,
        notes: $set.notes !== undefined ? $set.notes : existing?.notes,
        tags: $set.tags !== undefined ? $set.tags : existing?.tags,
      };
      const searchText = buildContactSearchText(merged);
      if (update.$set) update.$set.searchText = searchText;
      else update.searchText = searchText;
      next();
    })
    .catch(next);
});

// Indexes for performance
ContactSchema.index({ status: 1 });
ContactSchema.index({ types: 1 });
ContactSchema.index({ companyId: 1 });
ContactSchema.index({ tags: 1 });
ContactSchema.index({ 'platformLinks.platform': 1, 'platformLinks.platformUserId': 1 });
ContactSchema.index({ 'owner.orgId': 1 });
ContactSchema.index({ createdAt: -1 });
ContactSchema.index({ 'owner.orgId': 1, searchText: 1 });
