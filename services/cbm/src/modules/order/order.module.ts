import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { Order, OrderSchema } from './order.schema';
import { Contact, ContactSchema } from '../contact/contact.schema';
import { DomainConfigModule } from '../domain-config/domain-config.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Contact.name, schema: ContactSchema },
    ]),
    DomainConfigModule,
  ],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService, MongooseModule],
})
export class OrderModule {}
