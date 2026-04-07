import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDate,
  MaxLength,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@hydrabyte/base';
import { MoneyAmountDto } from '../invoice/invoice.dto';

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'e_wallet', 'other'] as const;

/**
 * DTO for recording a new payment
 * Payments are immutable — no UpdatePaymentDto
 */
export class CreatePaymentDto {
  @ApiProperty({
    description: 'Invoice ID this payment is for',
  })
  @IsString()
  invoiceId!: string;

  @ApiProperty({
    description: 'Payment amount',
    type: MoneyAmountDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  amount!: MoneyAmountDto;

  @ApiProperty({
    description: 'Payment date',
    type: Date,
    example: '2026-04-07T00:00:00.000Z',
  })
  @IsDate()
  @Type(() => Date)
  date!: Date;

  @ApiProperty({
    description: 'Payment method',
    enum: PAYMENT_METHODS,
    example: 'bank_transfer',
  })
  @IsEnum(PAYMENT_METHODS)
  method!: string;

  @ApiPropertyOptional({
    description: 'Note',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    description: 'Bank reference / receipt number',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

/**
 * DTO for querying payments
 */
export class PaymentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by invoice ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsString()
  invoiceId?: string;
}
