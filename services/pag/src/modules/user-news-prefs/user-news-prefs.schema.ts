import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserNewsPrefDocument = UserNewsPreference & Document;

@Schema({ timestamps: true })
export class UserNewsPreference {
  @Prop({ required: true })
  platformUserId: string;

  @Prop({ required: true })
  soulId: string;

  @Prop({ required: true })
  channelId: string;

  @Prop({ default: true })
  active: boolean;

  @Prop({ type: [String], default: [] })
  sourceIds: string[];

  @Prop({ type: [String], default: [] })
  categories: string[];

  @Prop({ enum: ['vi', 'en'], default: 'vi' })
  language: string;

  @Prop({ required: true, enum: ['morning', 'evening', 'both'], default: 'morning' })
  frequency: string;

  @Prop({
    type: {
      morning: { type: String, default: '07:00' },
      evening: { type: String, default: '18:00' },
    },
    default: () => ({ morning: '07:00', evening: '18:00' }),
  })
  deliveryTime: {
    morning: string;
    evening: string;
  };

  @Prop({ type: Date, default: null })
  lastDeliveredAt: Date | null;
}

export const UserNewsPreferenceSchema = SchemaFactory.createForClass(UserNewsPreference);

UserNewsPreferenceSchema.index({ platformUserId: 1, soulId: 1 }, { unique: true });
UserNewsPreferenceSchema.index({ active: 1, soulId: 1 });
