import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsDate,
  IsNumber,
  IsPositive,
  MinLength,
  MaxLength,
  ValidateNested,
  IsObject,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@hydrabyte/base';

export class MoneyAmountDto {
  @ApiProperty({
    description: 'ISO 4217 currency code',
    example: 'VND',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency!: string;

  @ApiProperty({
    description: 'Amount value',
    example: 1500000,
  })
  @IsNumber()
  @Min(0)
  value!: number;
}

export class InvoiceItemDto {
  @ApiProperty({
    description: 'Item description',
    example: 'Web development service - April 2026',
    maxLength: 500,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @ApiProperty({
    description: 'Quantity',
    example: 1,
  })
  @IsNumber()
  @IsPositive()
  qty!: number;

  @ApiProperty({
    description: 'Unit price',
    type: MoneyAmountDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  price!: MoneyAmountDto;

  @ApiProperty({
    description: 'Line total (qty × price)',
    type: MoneyAmountDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  amount!: MoneyAmountDto;
}

/**
 * DTO for creating a new invoice
 */
export class CreateInvoiceDto {
  @ApiProperty({
    description: 'Invoice code (auto-generated if omitted)',
    example: 'INV-2026-0001',
    maxLength: 50,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiProperty({
    description: 'Contact ID',
  })
  @IsString()
  contactId!: string;

  @ApiPropertyOptional({
    description: 'Company ID (optional)',
  })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Contract ID (optional)' })
  @IsOptional()
  @IsString()
  contractId?: string;

  @ApiPropertyOptional({ description: 'Contract Annex ID (optional)' })
  @IsOptional()
  @IsString()
  contractAnnexId?: string;

  @ApiPropertyOptional({ description: 'Order ID — link invoice to a booking order' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({
    description: 'Line items',
    type: [InvoiceItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];

  @ApiProperty({
    description: 'Subtotal amount',
    type: MoneyAmountDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  subtotal!: MoneyAmountDto;

  @ApiPropertyOptional({
    description: 'Tax amount',
    type: MoneyAmountDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  tax?: MoneyAmountDto;

  @ApiProperty({
    description: 'Total amount (subtotal + tax)',
    type: MoneyAmountDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  totalAmount!: MoneyAmountDto;

  @ApiProperty({
    description: 'Issue date',
    type: Date,
    example: '2026-04-07T00:00:00.000Z',
  })
  @IsDate()
  @Type(() => Date)
  issuedDate!: Date;

  @ApiPropertyOptional({
    description: 'Due date',
    type: Date,
    example: '2026-05-07T00:00:00.000Z',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dueDate?: Date;

  @ApiPropertyOptional({
    description: 'Notes',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  // status forced to 'draft' by service
  // eInvoice managed via dedicated PATCH endpoint (Phase 3)
}

/**
 * DTO for updating an invoice (only allowed in draft status)
 */
export class UpdateInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Contract ID (optional)' })
  @IsOptional()
  @IsString()
  contractId?: string;

  @ApiPropertyOptional({ description: 'Contract Annex ID (optional)' })
  @IsOptional()
  @IsString()
  contractAnnexId?: string;

  @ApiPropertyOptional({ description: 'Order ID — link invoice to a booking order' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ type: [InvoiceItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];

  @ApiPropertyOptional({ type: MoneyAmountDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  subtotal?: MoneyAmountDto;

  @ApiPropertyOptional({ type: MoneyAmountDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  tax?: MoneyAmountDto;

  @ApiPropertyOptional({ type: MoneyAmountDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  totalAmount?: MoneyAmountDto;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  issuedDate?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dueDate?: Date;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/**
 * DTO for querying invoices
 */
export class InvoiceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search text — searches in code, notes',
    example: 'INV-2026',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * DTO for linking e-invoice data (Phase 3)
 */
export class LinkEInvoiceDto {
  @ApiProperty({ description: 'E-invoice provider name', example: 'VNPT' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  provider!: string;

  @ApiProperty({ description: 'E-invoice ID from provider', example: 'VNPT-2026-001' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  eInvoiceId!: string;

  @ApiPropertyOptional({ description: 'PDF/XML download URL', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string;

  @ApiPropertyOptional({ description: 'Raw data from provider' })
  @IsOptional()
  @IsObject()
  rawData?: Record<string, any>;
}

const INVOICE_STATUSES = ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'] as const;

export class InvoiceStatusDto {
  @ApiProperty({ enum: INVOICE_STATUSES })
  @IsEnum(INVOICE_STATUSES)
  status!: string;
}
