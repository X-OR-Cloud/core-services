import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsBoolean, IsOptional, IsMongoId, MinLength, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateProductDto {
  @ApiProperty({ description: 'Product name', example: 'iPhone 15 Pro' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiProperty({ description: 'Product description', example: 'Latest iPhone with A17 Pro chip' })
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => value?.trim())
  description: string;

  @ApiProperty({ description: 'Product price', example: 999.99 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ description: 'Stock quantity', example: 100, default: 0, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  stock?: number;

  @ApiProperty({ description: 'Category ID', example: '507f1f77bcf86cd799439011' })
  @IsMongoId()
  categoryId: string;

  @ApiProperty({ description: 'Is product active', example: true, default: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateProductDto {
  @ApiProperty({ description: 'Product name', example: 'iPhone 15 Pro Max', required: false })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  name?: string;

  @ApiProperty({ description: 'Product description', example: 'Updated description', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  @Transform(({ value }) => value?.trim())
  description?: string;

  @ApiProperty({ description: 'Product price', example: 1099.99, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiProperty({ description: 'Stock quantity', example: 50, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  stock?: number;

  @ApiProperty({ description: 'Category ID', example: '507f1f77bcf86cd799439011', required: false })
  @IsMongoId()
  @IsOptional()
  categoryId?: string;

  @ApiProperty({ description: 'Is product active', example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
