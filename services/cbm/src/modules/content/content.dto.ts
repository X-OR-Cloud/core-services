import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  MinLength,
  MaxLength,
  IsNumber,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@hydrabyte/base';

/**
 * DTO for creating new content
 * MongoDB _id will be used as the primary identifier
 */
export class CreateContentDto {
  @ApiProperty({
    description: 'Content summary/title',
    example: 'Product Launch Report Q4 2025',
    maxLength: 500,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  summary!: string;

  @ApiProperty({
    description: 'Main text content',
    example: '# Executive Summary\n\nOur Q4 launch exceeded expectations...',
  })
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiProperty({
    description: 'Content type',
    enum: ['html', 'text', 'markdown', 'json', 'multipart'],
    example: 'markdown',
  })
  @IsEnum(['html', 'text', 'markdown', 'json', 'multipart'])
  contentType!: string;

  @ApiPropertyOptional({
    description: 'Labels for categorization and search',
    example: ['product', 'launch', 'report'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @ApiPropertyOptional({
    description: 'Content status',
    enum: ['draft', 'published', 'archived'],
    example: 'draft',
    default: 'draft',
  })
  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Access scope',
    enum: ['public', 'org', 'private'],
    example: 'private',
    default: 'private',
  })
  @IsOptional()
  @IsEnum(['public', 'org', 'private'])
  scope?: string;
}

/**
 * DTO for updating existing content metadata
 * All fields are optional, content body should be updated via UpdateBodyDto
 */
export class UpdateContentDto {
  @ApiPropertyOptional({
    description: 'Content summary/title',
    example: 'Updated Product Launch Report',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  summary?: string;

  @ApiPropertyOptional({
    description: 'Content status',
    enum: ['draft', 'published', 'archived'],
    example: 'published',
  })
  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Access scope',
    enum: ['public', 'org', 'private'],
    example: 'org',
  })
  @IsOptional()
  @IsEnum(['public', 'org', 'private'])
  scope?: string;

  @ApiPropertyOptional({
    description: 'Labels for categorization and search',
    example: ['product', 'launch', 'report', 'q4'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];
}

/**
 * DTO for querying contents with search and filters
 * Extends PaginationQueryDto to include search and filter functionality
 */
export class ContentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search text - searches in summary, body, and labels',
    example: 'product launch',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by content type',
    enum: ['html', 'text', 'markdown', 'json', 'multipart'],
  })
  @IsOptional()
  @IsEnum(['html', 'text', 'markdown', 'json', 'multipart'])
  contentType?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['draft', 'published', 'archived'],
  })
  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by attachment type (contents that have this type of attachment)',
    enum: ['image', 'video', 'audio', 'file'],
  })
  @IsOptional()
  @IsEnum(['image', 'video', 'audio', 'file'])
  hasAttachmentType?: string;
}

/**
 * DTO for updating content body
 * Supports multiple operation types: replace, find-replace, append operations
 */
export class UpdateBodyDto {
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
    description: 'New content for replace/append operations',
    example: '# New Content\n\nThis is the updated content.',
  })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({
    description: 'Text to find (for find-replace-text and append-after-text operations)',
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
    description: 'Markdown section heading (for find-replace-markdown and append-to-section operations)',
    example: '## API Specification',
  })
  @IsOptional()
  @IsString()
  section?: string;

  @ApiPropertyOptional({
    description: 'New section content (for find-replace-markdown operation)',
    example: '## API Specification\n\nUpdated API documentation here.',
  })
  @IsOptional()
  @IsString()
  sectionContent?: string;
}

/**
 * DTO for media attachment metadata
 */
export class MediaAttachmentDto {
  @ApiProperty({
    description: 'Attachment ID',
    example: 'att_abc123xyz',
  })
  @IsString()
  id!: string;

  @ApiProperty({
    description: 'Media type',
    enum: ['image', 'video', 'audio', 'file'],
    example: 'image',
  })
  @IsEnum(['image', 'video', 'audio', 'file'])
  type!: string;

  @ApiProperty({
    description: 'Storage provider',
    enum: ['minio', 's3', 'url'],
    example: 's3',
  })
  @IsEnum(['minio', 's3', 'url'])
  storageProvider!: string;

  @ApiPropertyOptional({
    description: 'Storage key (for minio/s3)',
    example: 'org-id/uuid-filename.png',
  })
  @IsOptional()
  @IsString()
  storageKey?: string;

  @ApiProperty({
    description: 'Access URL (public or signed)',
    example: 'https://cdn.example.com/org-id/uuid-filename.png',
  })
  @IsString()
  url!: string;

  @ApiProperty({
    description: 'Original filename',
    example: 'product-chart.png',
  })
  @IsString()
  originalName!: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 2048576,
  })
  @IsNumber()
  size!: number;

  @ApiProperty({
    description: 'MIME type',
    example: 'image/png',
  })
  @IsString()
  mime!: string;

  @ApiPropertyOptional({
    description: 'Image/video dimensions',
    example: { width: 1920, height: 1080 },
  })
  @IsOptional()
  @IsObject()
  dimensions?: { width: number; height: number };

  @ApiPropertyOptional({
    description: 'Duration in seconds (for video/audio)',
    example: 125,
  })
  @IsOptional()
  @IsNumber()
  duration?: number;

  @ApiPropertyOptional({
    description: 'Base64 thumbnail (< 100KB) for preview',
    example: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
  })
  @IsOptional()
  @IsString()
  thumbnail?: string;
}

/**
 * DTO for adding attachment to content
 */
export class AddAttachmentDto {
  @ApiProperty({
    description: 'Attachment metadata',
    type: MediaAttachmentDto,
  })
  @ValidateNested()
  @Type(() => MediaAttachmentDto)
  attachment!: MediaAttachmentDto;
}
