import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { HydratedDocument } from 'mongoose';


export type OrganizationDocument = HydratedDocument<Organization>;

@Schema({ collection: 'organizations' })
export class Organization extends BaseSchema {
  @Prop()
  name: string;

  @Prop()
  description: string;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
