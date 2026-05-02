import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ServiceAccountDocument = ServiceAccount & Document;

export class ServiceAccountPermission {
  service: string;   // 'cbm' | 'iam' | '*'
  resource: string;  // 'payment' | 'provider' | '*'
  action: string;    // 'createOne' | 'readAll' | 'updateOne' | '*'
}

@Schema({ timestamps: true, collection: 'service_accounts' })
export class ServiceAccount extends BaseSchema {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ enum: ['active', 'inactive'], default: 'active' })
  status: 'active' | 'inactive';

  @Prop({ required: true })
  secret: string; // bcrypt hashed (10 rounds)

  @Prop({ type: [Object], default: [] })
  permissions: ServiceAccountPermission[];

  @Prop()
  lastUsedAt?: Date;

  @Prop({ type: Date, default: null })
  secretRotatedAt?: Date | null;
}

export const ServiceAccountSchema = SchemaFactory.createForClass(ServiceAccount);
