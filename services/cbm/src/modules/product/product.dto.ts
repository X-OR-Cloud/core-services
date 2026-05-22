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
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@hydrabyte/base';

const STATUSES = ['active', 'inactive'] as const;

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

export class CreateProductDto {
  @ApiProperty({ example: 'SP000001', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: 'Bún bò Nam Bộ', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'ProductCategory ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ type: MoneyAmountDto })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  price!: MoneyAmountDto;

  @ApiProperty({ example: 8, description: 'Tax rate percentage' })
  @IsNumber()
  @Min(0)
  taxRate!: number;

  @ApiPropertyOptional({ enum: STATUSES, default: 'active' })
  @IsOptional()
  @IsEnum(STATUSES)
  status?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({
    description: 'Generic metadata (e.g. room info: capacity, bedConfig, priceWeekday, priceWeekend)',
    example: { maxGuests: 8, bedConfig: '3 giường 1.6×2m', priceWeekday: 1650000, priceWeekend: 1800000 },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ description: 'File IDs for room/product images', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageIds?: string[];
}

export class UpdateProductDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ type: MoneyAmountDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  price?: MoneyAmountDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsEnum(STATUSES)
  status?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({
    description: 'Generic metadata (e.g. room info: capacity, bedConfig, priceWeekday, priceWeekend)',
    example: { maxGuests: 8, bedConfig: '3 giường 1.6×2m', priceWeekday: 1650000 },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ description: 'File IDs for room/product images', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageIds?: string[];
}

export class ProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or code' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsEnum(STATUSES)
  status?: string;
}

export class ImportProductsDto {
  @ApiProperty({ type: [CreateProductDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductDto)
  items!: CreateProductDto[];
}
