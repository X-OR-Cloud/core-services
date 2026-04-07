import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@hydrabyte/base';

// No CreateTransactionDto / UpdateTransactionDto — Transactions are auto-generated

/**
 * DTO for querying transactions (read-only)
 */
export class TransactionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by transaction type',
    enum: ['income', 'expense'],
  })
  @IsOptional()
  @IsEnum(['income', 'expense'])
  type?: string;

  @ApiPropertyOptional({
    description: 'Filter by reference type',
    enum: ['payment', 'expense'],
  })
  @IsOptional()
  @IsEnum(['payment', 'expense'])
  referenceType?: string;

  @ApiPropertyOptional({
    description: 'Start date filter',
    type: Date,
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dateFrom?: Date;

  @ApiPropertyOptional({
    description: 'End date filter',
    type: Date,
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dateTo?: Date;
}

/**
 * DTO for summary query (Phase 3)
 */
export class TransactionSummaryQueryDto {
  @ApiPropertyOptional({
    description: 'Period: year | month | day',
    enum: ['year', 'month', 'day'],
    example: 'month',
  })
  @IsOptional()
  @IsEnum(['year', 'month', 'day'])
  period?: string;

  @ApiPropertyOptional({
    description: 'Filter by currency',
    example: 'VND',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dateFrom?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dateTo?: Date;
}
