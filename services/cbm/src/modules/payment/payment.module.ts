import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { Payment, PaymentSchema } from './payment.schema';
import { Provider, ProviderSchema } from '../provider/provider.schema';
import { InvoiceModule } from '../invoice/invoice.module';
import { TransactionModule } from '../transaction/transaction.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Provider.name, schema: ProviderSchema }, // direct model — avoids circular dep with ProviderModule
    ]),
    InvoiceModule,
    TransactionModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService, MongooseModule],
})
export class PaymentModule {}
