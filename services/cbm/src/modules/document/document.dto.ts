import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@hydrabyte/base';

/**
 * DTO for creating a new document
 * MongoDB _id will be used as the primary identifier
 */
export class CreateDocumentDto {
  @ApiProperty({
    description: 'Document summary/title',
    example: 'API Integration Guide',
    maxLength: 500,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  summary!: string;

  @ApiProperty({
    description: 'Document main content',
    example: 'This guide explains how to integrate with our REST API...',
  })
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiProperty({
    description: 'Content type',
    enum: ['html', 'text', 'markdown', 'json'],
    example: 'markdown',
  })
  @IsEnum(['html', 'text', 'markdown', 'json'])
  type!: string;

  @ApiProperty({
    description: 'Labels for categorization and search',
    example: ['api', 'guide', 'integration'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  labels!: string[];

  @ApiPropertyOptional({
    description: 'Project ID to associate this document with',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Sharing mode: private (creator/leads/admins only) or organization (all org members can view)',
    enum: ['private', 'organization'],
    default: 'private',
    example: 'private',
  })
  @IsOptional()
  @IsEnum(['private', 'organization'])
  shareMode?: string;

  // status is forced to 'draft' by DocumentService.create() — not settable by client
}

/**
 * DTO for updating an existing document
 * All fields are optional
 */
export class UpdateDocumentDto {
  @ApiPropertyOptional({
    description: 'Document summary/title',
    example: 'Updated API Integration Guide',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  summary?: string;

  @ApiPropertyOptional({
    description: 'Document main content',
    example: 'Updated content...',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @ApiPropertyOptional({
    description: 'Content type',
    enum: ['html', 'text', 'markdown', 'json'],
    example: 'markdown',
  })
  @IsOptional()
  @IsEnum(['html', 'text', 'markdown', 'json'])
  type?: string;

  @ApiPropertyOptional({
    description: 'Labels for categorization and search',
    example: ['api', 'guide', 'integration', 'rest'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @ApiPropertyOptional({
    description: 'Document status',
    enum: ['draft', 'published', 'archived'],
    example: 'published',
  })
  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Project ID to associate this document with',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Sharing mode: private (creator/leads/admins only) or organization (all org members can view)',
    enum: ['private', 'organization'],
    example: 'organization',
  })
  @IsOptional()
  @IsEnum(['private', 'organization'])
  shareMode?: string;
}

/**
 * DTO for querying documents with search support
 * Extends PaginationQueryDto to include search functionality
 */
export class DocumentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search text - searches in summary, content, and labels',
    example: 'API integration',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * DTO for updating document content
 * Supports multiple operation types: replace, find-replace, append operations
 */
export class UpdateContentDto {
  @ApiProperty({
    description: 'Operation type',
    enum: [
      'replace',
      'find-replace-text',
      'find-replace-regex',
      'find-replace-markdown',
      'append',
      'append-after-text',
      'append-to-section',
    ],
    example: 'replace',
  })
  @IsEnum([
    'replace',
    'find-replace-text',
    'find-replace-regex',
    'find-replace-markdown',
    'append',
    'append-after-text',
    'append-to-section',
  ])
  operation!: string;

  @ApiPropertyOptional({
    description: 'New content for replace operation',
    example: '# New Document Content\n\nThis is the updated content.',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    description: 'Text to find (for find-replace-text operation)',
    example: 'old text',
  })
  @IsOptional()
  @IsString()
  find?: string;

  @ApiPropertyOptional({
    description: 'Replacement text (for find-replace operations)',
    example: 'new text',
  })
  @IsOptional()
  @IsString()
  replace?: string;

  @ApiPropertyOptional({
    description: 'Regex pattern to find (for find-replace-regex operation)',
    example: 'TODO:\\s*.*',
  })
  @IsOptional()
  @IsString()
  pattern?: string;

  @ApiPropertyOptional({
    description: 'Regex flags (for find-replace-regex operation)',
    example: 'gi',
    default: 'g',
  })
  @IsOptional()
  @IsString()
  flags?: string;

  @ApiPropertyOptional({
    description: 'Markdown section heading to find (for find-replace-markdown operation)',
    example: '## API Specification',
  })
  @IsOptional()
  @IsString()
  section?: string;

  @ApiPropertyOptional({
    description: 'New content for the markdown section (for find-replace-markdown operation)',
    example: '## API Specification\n\nUpdated API documentation here.',
  })
  @IsOptional()
  @IsString()
  sectionContent?: string;
}

/**
 * DTO for creating a share link
 */
export class CreateShareLinkDto {
  @ApiPropertyOptional({
    description: 'Time-to-live in seconds (default: 3600 = 1 hour)',
    example: 3600,
    default: 3600,
    minimum: 60,
    maximum: 86400,
  })
  @IsOptional()
  @IsNumber()
  @Min(60)
  @Max(86400)
  @Type(() => Number)
  ttl?: number;
}
