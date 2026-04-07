import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsDate,
  MinLength,
  MaxLength,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@hydrabyte/base';
import { MoneyAmountDto } from '../invoice/invoice.dto';

const EXPENSE_CATEGORIES = ['salary', 'rent', 'tools', 'travel', 'marketing', 'utilities', 'other'] as const;

/**
 * DTO for creating a new expense
 */
export class CreateExpenseDto {
  @ApiProperty({
    description: 'Expense category',
    enum: EXPENSE_CATEGORIES,
    example: 'tools',
  })
  @IsEnum(EXPENSE_CATEGORIES)
  category!: string;

  @ApiProperty({
    description: 'Amount',
    type: MoneyAmountDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  amount!: MoneyAmountDto;

  @ApiPropertyOptional({
    description: 'Vendor Contact or Company ID (optional)',
  })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiPropertyOptional({
    description: 'Vendor name (free text, fallback if no vendorId)',
    example: 'AWS',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendorName?: string;

  @ApiProperty({
    description: 'Expense date',
    type: Date,
    example: '2026-04-07T00:00:00.000Z',
  })
  @IsDate()
  @Type(() => Date)
  date!: Date;

  @ApiProperty({
    description: 'Expense description',
    example: 'AWS EC2 monthly bill',
    maxLength: 1000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  description!: string;

  @ApiPropertyOptional({
    description: 'Receipt file URL',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  receiptUrl?: string;

  @ApiPropertyOptional({
    description: 'Tags for categorization',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Additional notes',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  // status forced to 'pending' by service
}

/**
 * DTO for updating an expense (only allowed in pending/rejected status)
 */
export class UpdateExpenseDto {
  @ApiPropertyOptional({ enum: EXPENSE_CATEGORIES })
  @IsOptional()
  @IsEnum(EXPENSE_CATEGORIES)
  category?: string;

  @ApiPropertyOptional({ type: MoneyAmountDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  amount?: MoneyAmountDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendorName?: string;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  date?: Date;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  receiptUrl?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/**
 * DTO for rejecting an expense (Phase 3)
 */
export class RejectExpenseDto {
  @ApiProperty({
    description: 'Reason for rejection',
    maxLength: 500,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  rejectionReason!: string;
}

/**
 * DTO for querying expenses
 */
export class ExpenseQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search text — searches in description, notes',
    example: 'AWS',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
