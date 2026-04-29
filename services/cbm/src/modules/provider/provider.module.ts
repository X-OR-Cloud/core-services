import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Provider, ProviderSchema } from './provider.schema';
import { ProviderService } from './provider.service';
import { ProviderController } from './provider.controller';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Provider.name, schema: ProviderSchema }]),
    PaymentModule, // for PaymentService in controller webhook handler
  ],
  controllers: [ProviderController],
  providers: [ProviderService],
  exports: [ProviderService, MongooseModule],
})
export class ProviderModule {}
