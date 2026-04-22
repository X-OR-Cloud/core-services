import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDate,
  IsObject,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@hydrabyte/base';
import { CONTRACT_STATUSES, CONTRACT_TYPES, ContractStatus, ContractType } from './contract.schema';
import { MoneyAmountDto } from '../invoice/invoice.dto';

export class CreateContractDto {
  @ApiPropertyOptional({
    description: 'Contract code (auto-generated if omitted: CTR-YYYY-NNNN)',
    example: 'CTR-2026-0001',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiProperty({
    description: 'Contract title',
    example: 'Software Development Service Contract',
    maxLength: 500,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @ApiProperty({ description: 'Contact ID' })
  @IsString()
  contactId!: string;

  @ApiPropertyOptional({ description: 'Company ID' })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({
    description: 'Contract type',
    enum: CONTRACT_TYPES,
    default: 'service',
  })
  @IsOptional()
  @IsEnum(CONTRACT_TYPES)
  type?: ContractType;

  @ApiPropertyOptional({
    description: 'Contract description',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Contract start date',
    type: Date,
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'Contract end date',
    type: Date,
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @ApiPropertyOptional({
    description: 'Total contract value',
    type: MoneyAmountDto,
  })
  @IsOptional()
  @IsObject()
  value?: MoneyAmountDto;

  @ApiPropertyOptional({ description: 'Notes', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateContractDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional({ description: 'Contact ID' })
  @IsOptional()
  @IsString()
  contactId?: string;

  @ApiPropertyOptional({ description: 'Company ID' })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({ enum: CONTRACT_TYPES })
  @IsOptional()
  @IsEnum(CONTRACT_TYPES)
  type?: ContractType;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @ApiPropertyOptional({ type: MoneyAmountDto })
  @IsOptional()
  @IsObject()
  value?: MoneyAmountDto;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ContractStatusDto {
  @ApiProperty({ enum: CONTRACT_STATUSES })
  @IsEnum(CONTRACT_STATUSES)
  status!: ContractStatus;
}

export class LinkContractEInvoiceDto {
  @ApiProperty({ description: 'E-invoice provider', example: 'VIETTEL' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  provider!: string;

  @ApiProperty({ description: 'E-invoice ID from provider' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  eInvoiceId!: string;

  @ApiPropertyOptional({ description: 'PDF/XML download URL', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string;

  @ApiPropertyOptional({ description: 'Raw response from provider' })
  @IsOptional()
  @IsObject()
  rawData?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Raw eInvoice object to store on contract entity' })
  @IsOptional()
  @IsObject()
  eInvoiceRawData?: Record<string, any>;
}

export class ContractQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search text (code, title, notes)',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
