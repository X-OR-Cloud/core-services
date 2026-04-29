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

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'e_wallet', 'other', 'gateway'] as const;

/**
 * DTO for recording a standard payment or initiating a gateway payment.
 *
 * Standard payment: { invoiceId (required), amount, date, method }
 * Gateway/pending:  { status: 'pending', amount, method: 'gateway', metadata: {...} }
 *   → CBM creates PayOS payment link → returns { paymentId, qrCode, checkoutUrl, expiredAt }
 */
export class CreatePaymentDto {
  @ApiPropertyOptional({ description: 'Invoice ID — required for standard payments, omit for gateway pending' })
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @ApiProperty({ description: 'Payment amount', type: MoneyAmountDto })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  amount!: MoneyAmountDto;

  @ApiPropertyOptional({ description: 'Payment date — required for standard payments', type: Date })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  date?: Date;

  @ApiPropertyOptional({ description: 'Payment method', enum: PAYMENT_METHODS, example: 'bank_transfer' })
  @IsOptional()
  @IsEnum(PAYMENT_METHODS)
  method?: string;

  @ApiPropertyOptional({ description: 'Note', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: 'Bank reference / receipt number', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional({
    description: "Set 'pending' to initiate a gateway (PayOS) payment — response includes qrCode, checkoutUrl, expiredAt",
    enum: ['pending'],
  })
  @IsOptional()
  @IsEnum(['pending'])
  status?: 'pending';

  @ApiPropertyOptional({
    description: 'Metadata for gateway payments',
    example: { platformUserId: 'zalo_123', platformType: 'zalo', planSlug: 'immortal_monthly', planAmount: 99000 },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class PaymentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by invoice ID' })
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @ApiPropertyOptional({ enum: ['pending', 'paid', 'expired', 'failed'] })
  @IsOptional()
  @IsEnum(['pending', 'paid', 'expired', 'failed'])
  status?: string;
}
