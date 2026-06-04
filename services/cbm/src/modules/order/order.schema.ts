import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { MoneyAmount } from '../../shared-types/money.types';

export type OrderDocument = Order & MongooseDocument;

export interface OrderCustomer {
  id?: string;    // contactId ref (optional — walk-in customer)
  name: string;
  phone?: string;
  address?: string;
}

export interface OrderItem {
  productId?: string;
  code: string;
  name: string;
  price: MoneyAmount;
  quantity: number;
  amount: MoneyAmount; // = price.value × quantity
}

export interface OrderDelivery {
  recipientName?: string;
  recipientPhone?: string;
  address?: string;
  shipperPhone?: string;
  note?: string;
}

export interface OrderPayment {
  id?: string;
  method?: string;  // 'cash' | 'transfer' | 'cod'
  status?: string;  // 'unpaid' | 'paid'
}

@Schema({ timestamps: true, collection: 'orders' })
export class Order extends BaseSchema {
  @Prop({ required: true, maxlength: 50 })
  code!: string; // auto-gen: ORD-YYYYMMDD-0001

  @Prop({ required: true, type: Object })
  customer!: OrderCustomer;

  @Prop({
    type: [
      {
        _id: false,
        productId: { type: String },
        code: { type: String, required: true },
        name: { type: String, required: true },
        price: { type: Object, required: true },
        quantity: { type: Number, required: true },
        amount: { type: Object, required: true },
      },
    ],
    default: [],
  })
  items!: OrderItem[];

  @Prop({ type: Object })
  delivery?: OrderDelivery;

  @Prop({ type: Object })
  payment?: OrderPayment;

  @Prop({ required: true, type: Object })
  subTotalAmount!: MoneyAmount;

  @Prop({ required: true, type: Object })
  taxAmount!: MoneyAmount;

  @Prop({ required: true, type: Object })
  totalAmount!: MoneyAmount;

  @Prop({
    required: true,
    enum: ['new', 'processing', 'deposited', 'active', 'done', 'cancelled'],
    default: 'new',
  })
  status!: string;

  @Prop({ maxlength: 2000 })
  note?: string;

  // Booking fields (optional — only for room/service booking orgs)
  @Prop({ type: Date })
  checkIn?: Date;

  @Prop({ type: Date })
  checkOut?: Date;

  @Prop({ type: String })
  invoiceId?: string; // ref: Invoice (linked quote/invoice)
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ code: 1, 'owner.orgId': 1 }, { unique: true });
OrderSchema.index({ 'customer.id': 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ 'owner.orgId': 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ 'owner.orgId': 1, createdAt: -1 });
OrderSchema.index({ 'owner.orgId': 1, status: 1, createdAt: -1 });
OrderSchema.index({ code: 'text', 'customer.name': 'text', 'customer.phone': 'text' });
// Booking-specific indexes
OrderSchema.index({ 'owner.orgId': 1, checkIn: 1, checkOut: 1 });
OrderSchema.index({ 'owner.orgId': 1, 'metadata.bookingType': 1, status: 1 });
