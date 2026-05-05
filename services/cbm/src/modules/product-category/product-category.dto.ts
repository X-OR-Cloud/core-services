import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@hydrabyte/base';

const STATUSES = ['active', 'inactive'] as const;

export class CreateProductCategoryDto {
  @ApiProperty({ example: 'Món mặn', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Các món ăn mặn truyền thống', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ enum: STATUSES, default: 'active' })
  @IsOptional()
  @IsEnum(STATUSES)
  status?: string;
}

export class UpdateProductCategoryDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsEnum(STATUSES)
  status?: string;
}

export class ProductCategoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsEnum(STATUSES)
  status?: string;
}
