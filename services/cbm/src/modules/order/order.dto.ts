import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsObject,
  IsArray,
  ValidateNested,
  MaxLength,
  Min,
  MinLength,
  IsPositive,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@hydrabyte/base';

const ORDER_STATUSES = ['new', 'processing', 'deposited', 'checked_in', 'done', 'cancelled'] as const;

const BOOKING_TYPES = ['room', 'service', 'maintenance'] as const;

export class MoneyAmountDto {
  @ApiProperty({ example: 'VND', minLength: 3, maxLength: 3 })
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency!: string;

  @ApiProperty({ example: 70000 })
  @IsNumber()
  @Min(0)
  value!: number;
}

export class OrderCustomerDto {
  @ApiPropertyOptional({ description: 'Contact ID (optional for walk-in)' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'Nguyễn Văn A', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: '0901234567', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}

export class OrderItemDto {
  @ApiPropertyOptional({ description: 'Product ID' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty({ example: 'SP000001' })
  @IsString()
  code!: string;

  @ApiProperty({ example: 'Bún bò Nam Bộ' })
  @IsString()
  name!: string;

  @ApiProperty({ type: MoneyAmountDto })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  price!: MoneyAmountDto;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiProperty({ type: MoneyAmountDto, description: 'price × quantity' })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  amount!: MoneyAmountDto;
}

export class OrderDeliveryDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  recipientPhone?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  shipperPhone?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class OrderPaymentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ example: 'cash' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ example: 'unpaid' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateOrderDto {
  @ApiProperty({ type: OrderCustomerDto })
  @IsObject()
  @ValidateNested()
  @Type(() => OrderCustomerDto)
  customer!: OrderCustomerDto;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @ApiPropertyOptional({ type: OrderDeliveryDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OrderDeliveryDto)
  delivery?: OrderDeliveryDto;

  @ApiPropertyOptional({ type: OrderPaymentDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OrderPaymentDto)
  payment?: OrderPaymentDto;

  @ApiProperty({ type: MoneyAmountDto })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  subTotalAmount!: MoneyAmountDto;

  @ApiProperty({ type: MoneyAmountDto })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  taxAmount!: MoneyAmountDto;

  @ApiProperty({ type: MoneyAmountDto })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  totalAmount!: MoneyAmountDto;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  // Booking fields
  @ApiPropertyOptional({ description: 'Check-in date (ISO 8601). Required when metadata.bookingType = room', example: '2026-06-01T14:00:00Z' })
  @IsOptional()
  @IsISO8601()
  checkIn?: string;

  @ApiPropertyOptional({ description: 'Check-out date (ISO 8601)', example: '2026-06-03T12:00:00Z' })
  @IsOptional()
  @IsISO8601()
  checkOut?: string;

  @ApiPropertyOptional({ description: 'Linked invoice ID' })
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @ApiPropertyOptional({
    description: 'Booking context. bookingType: room|service|maintenance. guestType: direct|agency',
    example: { bookingType: 'room', guestType: 'direct' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateOrderDto {
  @ApiPropertyOptional({ type: OrderCustomerDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OrderCustomerDto)
  customer?: OrderCustomerDto;

  @ApiPropertyOptional({ type: [OrderItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];

  @ApiPropertyOptional({ type: OrderDeliveryDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OrderDeliveryDto)
  delivery?: OrderDeliveryDto;

  @ApiPropertyOptional({ type: OrderPaymentDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OrderPaymentDto)
  payment?: OrderPaymentDto;

  @ApiPropertyOptional({ type: MoneyAmountDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  subTotalAmount?: MoneyAmountDto;

  @ApiPropertyOptional({ type: MoneyAmountDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  taxAmount?: MoneyAmountDto;

  @ApiPropertyOptional({ type: MoneyAmountDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  totalAmount?: MoneyAmountDto;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  // Booking fields
  @ApiPropertyOptional({ description: 'Check-in date (ISO 8601)', example: '2026-06-01T14:00:00Z' })
  @IsOptional()
  @IsISO8601()
  checkIn?: string;

  @ApiPropertyOptional({ description: 'Check-out date (ISO 8601)', example: '2026-06-03T12:00:00Z' })
  @IsOptional()
  @IsISO8601()
  checkOut?: string;

  @ApiPropertyOptional({ description: 'Linked invoice ID' })
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @ApiPropertyOptional({ description: 'Booking context metadata', example: { bookingType: 'room', guestType: 'direct' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class OrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by order code, customer name or phone' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  @IsEnum(ORDER_STATUSES)
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by customer contact ID' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Filter from date (ISO 8601 UTC)', example: '2026-05-01T00:00:00Z' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to date (ISO 8601 UTC)', example: '2026-05-08T23:59:59Z' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}

export class OrderStatusDto {
  @ApiProperty({ enum: ORDER_STATUSES })
  @IsEnum(ORDER_STATUSES)
  status!: string;
}

export class OrderStatsQueryDto {
  @ApiProperty({ description: 'Start of period (ISO 8601 UTC)', example: '2026-05-08T17:00:00.000Z' })
  @IsISO8601()
  dateFrom!: string;

  @ApiProperty({ description: 'End of period (ISO 8601 UTC)', example: '2026-05-09T16:59:59.999Z' })
  @IsISO8601()
  dateTo!: string;
}

export class AvailabilityQueryDto {
  @ApiProperty({ description: 'Product IDs to check (comma-separated or repeated)', example: ['productId1', 'productId2'] })
  @IsArray()
  @IsString({ each: true })
  productIds!: string[];

  @ApiProperty({ description: 'Check-in date (ISO 8601)', example: '2026-06-01T14:00:00Z' })
  @IsISO8601()
  checkIn!: string;

  @ApiProperty({ description: 'Check-out date (ISO 8601)', example: '2026-06-03T12:00:00Z' })
  @IsISO8601()
  checkOut!: string;
}

export class CalendarQueryDto {
  @ApiProperty({ description: 'Month in YYYY-MM format', example: '2026-06' })
  @IsString()
  month!: string;

  @ApiPropertyOptional({ description: 'Filter by booking type', enum: BOOKING_TYPES })
  @IsOptional()
  @IsEnum(BOOKING_TYPES)
  bookingType?: string;
}
