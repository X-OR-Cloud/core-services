import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsArray, IsNumber, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { MemoryCategory } from './memory.schema';

const MEMORY_CATEGORIES: MemoryCategory[] = ['user-preferences', 'decisions', 'notes', 'lessons'];

export class SearchMemoryDto {
  @ApiProperty({ description: 'Keyword to search in content and key' })
  @IsString()
  keyword: string;

  @ApiPropertyOptional({ enum: MEMORY_CATEGORIES, description: 'Optional category filter' })
  @IsOptional()
  @IsEnum(MEMORY_CATEGORIES)
  category?: MemoryCategory;

  @ApiPropertyOptional({ description: 'Max results (default: 5, max: 20)', default: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  @Type(() => Number)
  limit?: number;
}

export class UpsertMemoryDto {
  @ApiProperty({ enum: MEMORY_CATEGORIES })
  @IsEnum(MEMORY_CATEGORIES)
  category: MemoryCategory;

  @ApiProperty({ description: 'Slug-style key, e.g. "dung-report-style"' })
  @IsString()
  key: string;

  @ApiProperty({ description: 'Short, factual content (max 2000 chars)', maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ListMemoryKeysDto {
  @ApiPropertyOptional({ enum: MEMORY_CATEGORIES })
  @IsOptional()
  @IsEnum(MEMORY_CATEGORIES)
  category?: MemoryCategory;
}

export class ListMemoryDto {
  @ApiPropertyOptional({ enum: MEMORY_CATEGORIES, description: 'Filter by category' })
  @IsOptional()
  @IsEnum(MEMORY_CATEGORIES)
  category?: MemoryCategory;

  @ApiPropertyOptional({ description: 'Page number (default: 1)', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page (default: 20)', default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

export class DeleteMemoryDto {
  @ApiProperty({ enum: MEMORY_CATEGORIES })
  @IsEnum(MEMORY_CATEGORIES)
  category: MemoryCategory;

  @ApiProperty()
  @IsString()
  key: string;
}
