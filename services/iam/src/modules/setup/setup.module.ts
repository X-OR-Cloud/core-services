import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Organization, OrganizationSchema } from '../organization/organization.schema';
import { User, UserSchema } from '../user/user.schema';
import { OrganizationsModule } from '../organization/organization.module';
import { UsersModule } from '../user/user.module';
import { SetupService } from './setup.service';
import { SetupController } from './setup.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: User.name, schema: UserSchema },
    ]),
    OrganizationsModule,
    UsersModule,
  ],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
