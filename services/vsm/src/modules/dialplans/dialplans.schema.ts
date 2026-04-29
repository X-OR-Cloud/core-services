import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type DialplanDocument = Dialplan & Document;

class DialplanExtension {
  @Prop({ required: true }) exten: string;   // e.g. '_X.', 's', '100'
  @Prop({ required: true }) priority: number;
  @Prop({ required: true }) app: string;     // e.g. 'Dial', 'Answer', 'Hangup'
  @Prop() appData?: string;                  // e.g. 'PJSIP/${EXTEN},30'
}

@Schema({ timestamps: true, collection: 'dialplans' })
export class Dialplan extends BaseSchema {
  @Prop({ type: Types.ObjectId, required: true }) nodeId: Types.ObjectId;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) context: string; // Asterisk context name, e.g. 'from-internal'
  @Prop({ type: [DialplanExtension], default: [] }) extensions: DialplanExtension[];
  @Prop({ enum: ['pending', 'synced', 'error'], default: 'pending' }) syncStatus: string;
  @Prop() syncedAt?: Date;
}

export const DialplanSchema = SchemaFactory.createForClass(Dialplan);

DialplanSchema.index({ orgId: 1, nodeId: 1, context: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
