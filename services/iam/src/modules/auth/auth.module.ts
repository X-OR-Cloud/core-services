import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { HttpModule } from '@nestjs/axios';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenStorageService } from './token-storage.service';
import { JwtStrategy } from './jwt.strategy';
import {
  Organization,
  OrganizationSchema,
} from '../organization/organization.schema';
import { User, UserSchema } from '../user/user.schema';
import { LicenseModule } from '../license/license.module';

@Module({
  imports: [
    PassportModule,
    HttpModule,
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: User.name, schema: UserSchema },
    ]),
    LicenseModule, // Import for license fetching during login/refresh
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenStorageService, JwtStrategy],
  exports: [TokenStorageService],
})
export class AuthModule {}
