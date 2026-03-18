import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCategoryDto {
  @ApiProperty({ description: 'Category name', example: 'Electronics' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiProperty({ description: 'Category description', example: 'Electronic devices and accessories' })
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim())
  description: string;

  @ApiProperty({ description: 'Is category active', example: true, default: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateCategoryDto {
  @ApiProperty({ description: 'Category name', example: 'Electronics', required: false })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  name?: string;

  @ApiProperty({ description: 'Category description', example: 'Electronic devices and accessories', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim())
  description?: string;

  @ApiProperty({ description: 'Is category active', example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
