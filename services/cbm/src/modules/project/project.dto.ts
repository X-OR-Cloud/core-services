import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsDate,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@hydrabyte/base';

/**
 * DTO for creating a new project
 * MongoDB _id will be used as the primary identifier
 */
export class CreateProjectDto {
  @ApiProperty({
    description: 'Project name',
    example: 'Q1 2025 Product Launch',
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    description: 'Project description',
    example: 'Launch new product features for Q1 2025',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Array of member user IDs',
    example: ['user123', 'user456'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  members?: string[];

  @ApiPropertyOptional({
    description: 'Project start date',
    example: '2025-01-01T00:00:00.000Z',
    type: Date,
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'Project end date',
    example: '2025-03-31T23:59:59.000Z',
    type: Date,
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @ApiPropertyOptional({
    description: 'Tags for categorization',
    example: ['product', 'launch', 'q1'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // status is forced to 'draft' by ProjectService.create() — not settable by client
}

/**
 * DTO for updating an existing project
 * All fields are optional
 */
export class UpdateProjectDto {
  @ApiPropertyOptional({
    description: 'Project name',
    example: 'Q1 2025 Product Launch - Updated',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: 'Project description',
    example: 'Updated description...',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Array of member user IDs',
    example: ['user123', 'user456', 'user789'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  members?: string[];

  @ApiPropertyOptional({
    description: 'Project start date',
    type: Date,
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'Project end date',
    type: Date,
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @ApiPropertyOptional({
    description: 'Tags for categorization',
    example: ['product', 'launch', 'q1', 'priority'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // status changes only via action endpoints (activate, hold, resume, complete, archive)
}

/**
 * DTO for querying projects with search support
 * Extends PaginationQueryDto to include search functionality
 */
export class ProjectQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search text - searches in name, description, and tags',
    example: 'product launch',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
