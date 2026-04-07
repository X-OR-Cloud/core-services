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
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@hydrabyte/base';

const CONTACT_TYPES = ['customer', 'partner', 'vendor'] as const;

export class PlatformLinkDto {
  @ApiProperty({
    description: 'Chat platform name',
    example: 'discord',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  platform!: string;

  @ApiProperty({
    description: 'User ID on the platform',
    example: '1074993237363802122',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  platformUserId!: string;

  @ApiPropertyOptional({
    description: 'Username or display name on the platform',
    example: 'john_doe#1234',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  platformUsername?: string;
}

/**
 * DTO for creating a new contact
 */
export class CreateContactDto {
  @ApiProperty({
    description: 'Contact full name',
    example: 'Nguyen Van A',
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    description: 'Contact types (multi-value)',
    enum: CONTACT_TYPES,
    isArray: true,
    example: ['customer'],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(CONTACT_TYPES, { each: true })
  types?: string[];

  @ApiPropertyOptional({
    description: 'Reference to Company ID (optional)',
  })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({
    description: 'Email address',
    example: 'nguyen.van.a@example.com',
    maxLength: 200,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({
    description: 'Phone number',
    example: '+84 912 345 678',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Job title',
    example: 'CEO',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @ApiPropertyOptional({
    description: 'Address',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({
    description: 'Chat platform identity links',
    type: [PlatformLinkDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlatformLinkDto)
  platformLinks?: PlatformLinkDto[];

  @ApiPropertyOptional({
    description: 'Tags for categorization',
    example: ['vip', 'hot-lead'],
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

  // status defaults to 'active'
}

/**
 * DTO for updating an existing contact
 */
export class UpdateContactDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: CONTACT_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(CONTACT_TYPES, { each: true })
  types?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({ type: [PlatformLinkDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlatformLinkDto)
  platformLinks?: PlatformLinkDto[];

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

  // status managed via action endpoints (Phase 3)
}

/**
 * DTO for querying contacts
 */
export class ContactQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search text — searches in name, email, notes',
    example: 'nguyen',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
