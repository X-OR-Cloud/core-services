import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { HydratedDocument } from 'mongoose';
import { UserStatuses } from '../../core/enums/user.enum';
import { PasswordHashAlgorithms } from '../../core/enums/other.enum';
import { AuthProvider } from '../../core/enums/auth-provider.enum';

export interface UserMetadata {
  googleId?: string;
  avatarUrl?: string | null;
  discordUserId?: string;
  discordUsername?: string;
  telegramUserId?: string;
  telegramUsername?: string;
  [key: string]: any;
}

export type UserDocument = HydratedDocument<User>;

@Schema()
export class User extends BaseSchema {
  @Prop({ required: true, unique: true })
  username: string;

  @Prop({
    type: {
      hashedValue: { type: String, required: false },
      algorithm: { type: String, required: false },
      ref: { type: String, required: false },
    },
    required: false,
    default: null,
  })
  password: {
    hashedValue: string;
    algorithm: PasswordHashAlgorithms;
    ref?: string;
  } | null;

  @Prop({ required: true })
  role: string;

  @Prop({ type: String, enum: Object.values(UserStatuses), default: UserStatuses.Active })
  status: UserStatuses;

  @Prop({ required: false })
  fullname?: string;

  @Prop({ type: [String], required: false })
  phonenumbers?: string[];

  @Prop({ required: false })
  address?: string;

  // Override metadata from BaseSchema with specific type
  @Prop({ type: Object, required: false, default: {} })
  metadata: UserMetadata;

  @Prop({ type: String, enum: Object.values(AuthProvider), default: AuthProvider.LOCAL })
  provider: AuthProvider;

  @Prop({ type: Date, required: false, default: null })
  lastLoginAt: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
