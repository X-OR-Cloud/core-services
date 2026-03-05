import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsDate,
  IsEnum,
  IsMongoId,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@hydrabyte/base';

export class ProjectMemberDto {
  @ApiProperty({ enum: ['user', 'agent'] })
  @IsEnum(['user', 'agent'])
  type!: 'user' | 'agent';

  @ApiProperty({
    description: 'User or Agent ObjectId',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId()
  id!: string;

  @ApiProperty({ enum: ['project.lead', 'project.member'] })
  @IsEnum(['project.lead', 'project.member'])
  role!: 'project.lead' | 'project.member';
}

export class ProjectLeadDto {
  @ApiProperty({ enum: ['user', 'agent'], description: 'Type of the project lead' })
  @IsEnum(['user', 'agent'])
  type!: 'user' | 'agent';

  @ApiProperty({
    description: 'User or Agent ObjectId. For agent type: TODO cross-validate with AIWM service.',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId()
  id!: string;
}

export class AddMemberDto {
  @ApiProperty({ enum: ['user', 'agent'] })
  @IsEnum(['user', 'agent'])
  type!: 'user' | 'agent';

  @ApiProperty({
    description: 'User or Agent ObjectId. For agent type: TODO cross-validate with AIWM service.',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId()
  id!: string;

  @ApiProperty({ enum: ['project.lead', 'project.member'] })
  @IsEnum(['project.lead', 'project.member'])
  role!: 'project.lead' | 'project.member';
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ['project.lead', 'project.member'] })
  @IsEnum(['project.lead', 'project.member'])
  role!: 'project.lead' | 'project.member';
}

/**
 * DTO for creating a new project
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
    description: 'Public summary visible to all org members (non-members see only this)',
    example: 'Launching new product features for Q1 2025',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @ApiPropertyOptional({
    description: 'Private description visible to project members only',
    example: 'Launch new product features for Q1 2025',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Project lead — will be added as first member with role project.lead',
    type: ProjectLeadDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProjectLeadDto)
  lead?: ProjectLeadDto;

  @ApiPropertyOptional({
    description: 'Initial project members',
    type: [ProjectMemberDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectMemberDto)
  members?: ProjectMemberDto[];

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
 * All fields are optional. Members managed via /projects/:id/members endpoints.
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
    description: 'Public summary visible to all org members',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @ApiPropertyOptional({
    description: 'Private description visible to project members only',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Project start date', type: Date })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional({ description: 'Project end date', type: Date })
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
  // members managed via /projects/:id/members endpoints
}

/**
 * DTO for querying projects with search support
 */
export class ProjectQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search text - searches in name, summary, description, and tags',
    example: 'product launch',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
