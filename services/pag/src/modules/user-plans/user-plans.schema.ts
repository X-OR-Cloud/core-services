import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserPlanDocument = UserPlan & Document;

@Schema({ timestamps: true })
export class UserPlan {
  @Prop({ required: true })
  platformUserId: string;

  @Prop({ required: true, enum: ['mortal', 'immortal', 'god'], default: 'mortal' })
  planSlug: string;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;               // null = no expiry (Mortal)

  @Prop({ type: Date, default: Date.now })
  activatedAt: Date;

  @Prop({ type: String, default: null })
  previousPlanSlug: string | null;      // track downgrade history
}

export const UserPlanSchema = SchemaFactory.createForClass(UserPlan);

UserPlanSchema.index({ platformUserId: 1 }, { unique: true });
