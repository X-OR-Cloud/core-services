import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { Payment, PaymentSchema } from './payment.schema';
import { Provider, ProviderSchema } from '../provider/provider.schema';
import { InvoiceModule } from '../invoice/invoice.module';
import { TransactionModule } from '../transaction/transaction.module';
import { WebhookOutboundProcessor, WEBHOOK_OUTBOUND_QUEUE } from './webhook-outbound.processor';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Provider.name, schema: ProviderSchema }, // direct model — avoids circular dep with ProviderModule
    ]),
    BullModule.registerQueue({ name: WEBHOOK_OUTBOUND_QUEUE }),
    InvoiceModule,
    TransactionModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, WebhookOutboundProcessor],
  exports: [PaymentService, MongooseModule],
})
export class PaymentModule {}
