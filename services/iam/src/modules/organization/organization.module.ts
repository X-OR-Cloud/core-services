import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationsController } from './organization.controller';
import { OrganizationsService } from './organization.service';
import { Organization, OrganizationSchema } from './organization.schema';
import { LicenseModule } from '../license/license.module';
import { IamQueueModule } from '../../queues/queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Organization.name, schema: OrganizationSchema }]),
    LicenseModule,
    IamQueueModule,
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}
