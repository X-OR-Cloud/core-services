import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsObject,
  IsPositive,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@hydrabyte/base';
import {
  CONTRACT_ANNEX_STATUSES,
  ContractAnnexStatus,
  UnitCode,
} from './contract-annex.schema';
import { MoneyAmountDto } from '../invoice/invoice.dto';

export class ServiceItemUnitDto {
  @ApiPropertyOptional({
    description: 'Unit ID (from eInvoice provider, default empty string)',
    default: '',
    example: '',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({
    description: 'Unit code',
    enum: UnitCode,
    example: UnitCode.MONTH,
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    description: 'Unit display name',
    example: 'Tháng',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class ServiceItemDto {
  @ApiProperty({
    description: 'Service name',
    example: 'Cloud Hosting Service',
    maxLength: 500,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  name!: string;

  @ApiPropertyOptional({
    description: 'Service description',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ description: 'Quantity', example: 3 })
  @IsNumber()
  @IsPositive()
  qty!: number;

  @ApiPropertyOptional({
    description: 'Unit object (id, code, name)',
    type: ServiceItemUnitDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ServiceItemUnitDto)
  unit?: ServiceItemUnitDto;

  @ApiProperty({ description: 'Unit price', type: MoneyAmountDto })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  unitPrice!: MoneyAmountDto;

  @ApiProperty({ description: 'Line total (qty × unitPrice)', type: MoneyAmountDto })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  amount!: MoneyAmountDto;
}

export class CreateContractAnnexDto {
  @ApiProperty({ description: 'Contract ID this annex belongs to' })
  @IsString()
  contractId!: string;

  @ApiProperty({
    description: 'Annex title',
    example: 'Phụ lục 01 – Dịch vụ tháng 4/2026',
    maxLength: 500,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @ApiPropertyOptional({ description: 'Description', maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Service items',
    type: [ServiceItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceItemDto)
  serviceItems?: ServiceItemDto[];

  @ApiPropertyOptional({ description: 'Subtotal amount', type: MoneyAmountDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  subtotal?: MoneyAmountDto;

  @ApiPropertyOptional({ description: 'Notes', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateContractAnnexDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ type: [ServiceItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceItemDto)
  serviceItems?: ServiceItemDto[];

  @ApiPropertyOptional({ type: MoneyAmountDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  subtotal?: MoneyAmountDto;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ContractAnnexStatusDto {
  @ApiProperty({ enum: CONTRACT_ANNEX_STATUSES })
  @IsEnum(CONTRACT_ANNEX_STATUSES)
  status!: ContractAnnexStatus;
}

export class LinkAnnexEInvoiceDto {
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

  @ApiPropertyOptional({ description: 'Raw eInvoice object to store on annex entity' })
  @IsOptional()
  @IsObject()
  eInvoiceRawData?: Record<string, any>;
}

export class ContractAnnexQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search text (code, title, notes)' })
  @IsOptional()
  @IsString()
  search?: string;
}
