import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { HydratedDocument } from 'mongoose';

export type AppDocument = HydratedDocument<App>;

export enum AppStatus {
  Active = 'active',
  Inactive = 'inactive',
}

@Schema()
export class App extends BaseSchema {
  @Prop({ required: true })
  name: string;

  @Prop({ required: false })
  description: string;

  @Prop({ type: [String], default: [] })
  allowedDomains: string[];

  @Prop({ required: true })
  defaultOrgId: string;

  @Prop({ required: true, default: 'organization.viewer' })
  defaultRole: string;

  @Prop({ type: Boolean, default: true })
  ssoEnabled: boolean;

  @Prop({ type: String, enum: Object.values(AppStatus), default: AppStatus.Active })
  status: AppStatus;
}

export const AppSchema = SchemaFactory.createForClass(App);
