import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServiceAccountController } from './service-account.controller';
import { ServiceAccountService } from './service-account.service';
import { ServiceAccount, ServiceAccountSchema } from './service-account.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ServiceAccount.name, schema: ServiceAccountSchema }]),
  ],
  controllers: [ServiceAccountController],
  providers: [ServiceAccountService],
  exports: [ServiceAccountService],
})
export class ServiceAccountModule {}
