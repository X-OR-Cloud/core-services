import {
  IsString,
  IsEnum,
  IsOptional,
  IsMongoId,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConfigKey } from '@hydrabyte/shared';
import { ConfigScope } from './configuration.schema';

/**
 * Create/Update Configuration DTO
 */
export class CreateConfigurationDto {
  @ApiProperty({
    description: 'Configuration key (predefined enum)',
    enum: ConfigKey,
    example: ConfigKey.S3_ENDPOINT,
  })
  @IsEnum(ConfigKey, { message: 'Key must be a valid ConfigKey enum value' })
  key!: ConfigKey;

  @ApiProperty({
    description: 'Configuration value (plain text)',
    example: 'https://minio.example.com',
  })
  @IsString()
  @MinLength(1, { message: 'Value cannot be empty' })
  @MaxLength(5000, { message: 'Value is too long (max 5000 characters)' })
  value!: string;

  @ApiPropertyOptional({
    description: 'Scope: global (all orgs) or org (org-specific override). Defaults to org.',
    enum: ['global', 'org'],
    example: 'org',
  })
  @IsOptional()
  @IsEnum(['global', 'org'])
  scope?: ConfigScope;

  @ApiPropertyOptional({
    description: 'Admin notes about this configuration',
    example: 'Primary MinIO instance for production',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/**
 * Update Configuration DTO (partial update)
 */
export class UpdateConfigurationDto {
  @ApiPropertyOptional({
    description: 'Configuration value (plain text)',
    example: 'https://minio-new.example.com',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  value?: string;

  @ApiPropertyOptional({
    description: 'Admin notes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/**
 * Configuration Response DTO (for list - WITHOUT value)
 */
export class ConfigurationListResponseDto {
  @ApiProperty({ example: '675a1b2c3d4e5f6a7b8c9d0e' })
  _id!: string;

  @ApiProperty({ enum: ConfigKey, example: ConfigKey.S3_ENDPOINT })
  key!: string;

  @ApiProperty({
    description: 'Metadata for this config key',
    example: {
      displayName: 'S3 Endpoint',
      description: 'S3-compatible storage endpoint URL',
      dataType: 'url',
      isRequired: true,
      example: 'https://minio.example.com',
    },
  })
  metadata!: any;

  @ApiProperty({ enum: ['global', 'org'], example: 'org' })
  scope!: ConfigScope;

  @ApiPropertyOptional({ example: 'Primary MinIO instance' })
  notes?: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

/**
 * Configuration Detail Response DTO (WITH value)
 */
export class ConfigurationDetailResponseDto extends ConfigurationListResponseDto {
  @ApiProperty({
    description: 'Configuration value (only in detail response)',
    example: 'https://minio.example.com',
  })
  value!: string;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty()
  updatedBy!: string;
}

/**
 * Query Parameters for List
 */
export class ConfigurationQueryDto {
  @ApiPropertyOptional({
    description: 'Page number',
    default: 1,
  })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 50,
  })
  @IsOptional()
  limit?: number;
}

/**
 * Initialize Configurations DTO
 */
export class InitializeConfigurationsDto {
  @ApiProperty({
    description: 'Scope to initialize: "global" (universe.owner only) or "organization"',
    enum: ['global', 'organization'],
    example: 'organization',
  })
  @IsEnum(['global', 'organization'], { message: 'scope must be global or organization' })
  scope!: 'global' | 'organization';

  @ApiPropertyOptional({
    description:
      'Target org ID. Only allowed for universe.owner with scope=organization. ' +
      'organization.owner cannot set this — their own orgId is used automatically.',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsMongoId({ message: 'orgId must be a valid MongoDB ObjectId' })
  orgId?: string;
}

/**
 * Initialize All Configurations Response DTO
 */
export class InitializeConfigurationsResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 26 })
  total!: number;

  @ApiProperty({ example: 18 })
  created!: number;

  @ApiProperty({ example: 8 })
  skipped!: number;
}
