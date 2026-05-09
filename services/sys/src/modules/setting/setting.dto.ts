import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsMongoId,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConfigKey } from '@hydrabyte/shared';
import { SettingScope } from './setting.schema';

/**
 * Create or update Setting DTO (upsert)
 */
export class CreateSettingDto {
  @ApiProperty({
    description: 'Setting key (predefined enum)',
    enum: ConfigKey,
    example: ConfigKey.S3_ENDPOINT,
  })
  @IsEnum(ConfigKey, { message: 'key must be a valid ConfigKey enum value' })
  key!: ConfigKey;

  @ApiProperty({
    description: 'Setting value (plain text). For sensitive keys, masked in list/detail responses (use POST /settings/:key/reveal to read plaintext).',
    example: 'https://minio.example.com',
  })
  @IsString()
  @MinLength(1, { message: 'value cannot be empty' })
  @MaxLength(5000, { message: 'value is too long (max 5000 characters)' })
  value!: string;

  @ApiPropertyOptional({
    description: 'Scope: global (all orgs) or org (org-specific override). Defaults to org.',
    enum: ['global', 'org'],
    example: 'org',
  })
  @IsOptional()
  @IsEnum(['global', 'org'])
  scope?: SettingScope;

  @ApiPropertyOptional({
    description: 'Admin notes about this setting',
    example: 'Primary MinIO instance for production',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/**
 * Update Setting DTO (partial — by :key)
 */
export class UpdateSettingDto {
  @ApiPropertyOptional({
    description: 'Setting value',
    example: 'https://minio-new.example.com',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  value?: string;

  @ApiPropertyOptional({ description: 'Admin notes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/**
 * Initialize all setting keys with empty values for a scope/org.
 * Only creates keys that don't exist; never overwrites.
 */
export class InitializeSettingsDto {
  @ApiProperty({
    description: 'Scope to initialize: "global" (universe.owner only) or "org"',
    enum: ['global', 'org'],
    example: 'org',
  })
  @IsEnum(['global', 'org'], { message: 'scope must be global or org' })
  scope!: SettingScope;

  @ApiPropertyOptional({
    description:
      'Target orgId. Allowed only for universe.owner with scope=org. ' +
      'organization.owner cannot set this — caller orgId is used automatically.',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsMongoId({ message: 'orgId must be a valid MongoDB ObjectId' })
  orgId?: string;
}

/**
 * Query parameters for list endpoint
 */
export class SettingQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 50 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by scope', enum: ['global', 'org'] })
  @IsOptional()
  @IsEnum(['global', 'org'])
  scope?: SettingScope;

  @ApiPropertyOptional({ description: 'Filter by sensitive flag' })
  @IsOptional()
  @IsBoolean()
  sensitive?: boolean;
}

// =========================================================================
// Response DTOs
// =========================================================================

/**
 * Setting list item (WITHOUT value, sensitive value never exposed here)
 */
export class SettingListItemDto {
  @ApiProperty({ example: '675a1b2c3d4e5f6a7b8c9d0e' })
  _id!: string;

  @ApiProperty({ enum: ConfigKey })
  key!: string;

  @ApiProperty({ enum: ['global', 'org'] })
  scope!: SettingScope;

  @ApiProperty({ description: 'Whether the value is sensitive (masked in UI)' })
  sensitive!: boolean;

  @ApiPropertyOptional()
  notes?: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

/**
 * Setting detail (value INCLUDED for non-sensitive; '***' for sensitive — use /reveal endpoint).
 */
export class SettingDetailDto extends SettingListItemDto {
  @ApiProperty({
    description: 'Setting value (or "***" for sensitive — use POST /settings/:key/reveal to read plaintext)',
    example: 'https://minio.example.com',
  })
  value!: string;
}

/**
 * Reveal response for sensitive setting (universe.owner only).
 */
export class SettingRevealResponseDto {
  @ApiProperty({ enum: ConfigKey })
  key!: string;

  @ApiProperty({ description: 'Plaintext value' })
  value!: string;

  @ApiProperty({ description: 'Timestamp when reveal was performed (also recorded in audit log)' })
  revealedAt!: Date;
}

export class InitializeSettingsResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 26 })
  total!: number;

  @ApiProperty({ example: 18 })
  created!: number;

  @ApiProperty({ example: 8 })
  skipped!: number;
}
