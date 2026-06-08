import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type TicketDocument = Ticket & MongooseDocument;

export const TICKET_STATUSES = ['new', 'assigned', 'in_progress', 'resolved', 'closed'] as const;
export type TicketStatus = typeof TICKET_STATUSES[number];

@Schema({ timestamps: true, collection: 'tickets' })
export class Ticket extends BaseSchema {
  @Prop({ required: true })
  category!: string;

  @Prop({ required: true, maxlength: 5000 })
  content!: string;

  @Prop({ min: 1, max: 5 })
  rating?: number;

  @Prop({
    type: { id: String, name: String, address: String },
    _id: false,
  })
  outlet?: {
    id?: string;
    name?: string;
    address?: string;
  };

  @Prop({
    type: { name: String, phone: String, email: String, contactId: String },
    _id: false,
  })
  submitter?: {
    name?: string;
    phone?: string;
    email?: string;
    contactId?: string;
  };

  @Prop({
    type: { userId: String, fullname: String, phonenumber: String },
    _id: false,
  })
  assignee?: {
    userId?: string;
    fullname?: string;
    phonenumber?: string;
  };

  @Prop({ type: String, required: true, enum: TICKET_STATUSES, default: 'new' })
  status!: TicketStatus;

  @Prop({ maxlength: 2000 })
  resolution?: string;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);

TicketSchema.index({ status: 1 });
TicketSchema.index({ rating: 1 });
TicketSchema.index({ 'outlet.id': 1 });
TicketSchema.index({ 'owner.orgId': 1 });
TicketSchema.index({ createdAt: -1 });
