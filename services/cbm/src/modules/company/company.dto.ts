import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsEmail,
  MinLength,
  MaxLength,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@hydrabyte/base';

const COMPANY_TYPES = ['customer', 'partner', 'vendor'] as const;

export class CompanyAddressDto {
  @ApiPropertyOptional({ example: '123 Nguyen Trai' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string;

  @ApiPropertyOptional({ example: 'Ho Chi Minh City' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Ho Chi Minh' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @ApiPropertyOptional({ example: 'Vietnam' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: '700000' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;
}

/**
 * DTO for creating a new company
 */
export class CreateCompanyDto {
  @ApiProperty({
    description: 'Company name',
    example: 'Acme Corporation',
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    description: 'Company types (multi-value)',
    enum: COMPANY_TYPES,
    isArray: true,
    example: ['customer', 'partner'],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(COMPANY_TYPES, { each: true })
  types?: string[];

  @ApiPropertyOptional({
    description: 'Tax identification number (Mã số thuế)',
    example: '0123456789',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxCode?: string;

  @ApiPropertyOptional({
    description: 'Company website',
    example: 'https://acme.com',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @ApiPropertyOptional({
    description: 'Industry sector',
    example: 'Technology',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional({
    description: 'Contact phone number',
    example: '+84 28 1234 5678',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Contact email address',
    example: 'contact@acme.com',
    maxLength: 200,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({
    description: 'Company address',
    type: CompanyAddressDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CompanyAddressDto)
  address?: CompanyAddressDto;

  @ApiPropertyOptional({
    description: 'Tags for categorization',
    example: ['vip', 'enterprise'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Internal notes',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  // status defaults to 'active' — managed via action endpoints
}

/**
 * DTO for updating an existing company
 * All fields are optional.
 */
export class UpdateCompanyDto {
  @ApiPropertyOptional({
    description: 'Company name',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: 'Company types (multi-value)',
    enum: COMPANY_TYPES,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(COMPANY_TYPES, { each: true })
  types?: string[];

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxCode?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ type: CompanyAddressDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CompanyAddressDto)
  address?: CompanyAddressDto;

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

  // status managed via action endpoints (activate / deactivate)
}

/**
 * DTO for querying companies with search + filter support
 */
export class CompanyQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search text — searches in name, taxCode, notes',
    example: 'acme',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
