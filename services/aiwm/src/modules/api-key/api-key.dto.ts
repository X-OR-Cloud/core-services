import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsOptional,
  IsDateString,
  MinLength,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({
    description: 'Display name for this API key',
    example: 'Production App',
    maxLength: 100,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description:
      'Access scopes. Use ["all"] for full AIWM API access, or ' +
      '["deployment:<id>"] to restrict to specific deployment inference endpoints.',
    example: ['all'],
    default: ['all'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  scopes?: string[];

  @ApiPropertyOptional({
    description: 'Expiry date (ISO 8601). Omit for non-expiring key.',
    example: '2027-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

/**
 * Response after creating a key — includes plain text key (returned once only)
 */
export class CreateApiKeyResponseDto {
  @ApiProperty({ example: '68a1b2c3d4e5f6a7b8c9d0e1' })
  _id!: string;

  @ApiProperty({ example: 'Production App' })
  name!: string;

  @ApiProperty({ example: 'a1b2c3d4' })
  keyPrefix!: string;

  @ApiProperty({ example: ['all'] })
  scopes!: string[];

  @ApiProperty({ example: 'active' })
  status!: string;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z' })
  expiresAt?: Date | null;

  @ApiProperty({
    description: 'Full API key — shown once only, store it securely.',
    example: 'xai_a1b2c3d4.k9mN2xPqR7vL4wYtJ8uZnCeHsAbF1dGo',
  })
  key!: string;
}

/**
 * Response for list/get — never exposes keyHash or full key
 */
export class ApiKeyResponseDto {
  @ApiProperty({ example: '68a1b2c3d4e5f6a7b8c9d0e1' })
  _id!: string;

  @ApiProperty({ example: 'Production App' })
  name!: string;

  @ApiProperty({ description: 'First 8 chars for identification', example: 'a1b2c3d4' })
  keyPrefix!: string;

  @ApiProperty({ example: ['all'] })
  scopes!: string[];

  @ApiProperty({ enum: ['active', 'revoked'], example: 'active' })
  status!: string;

  @ApiPropertyOptional({ example: '2026-03-10T08:00:00.000Z' })
  lastUsedAt?: Date | null;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z' })
  expiresAt?: Date | null;

  @ApiProperty({ example: '2026-03-01T00:00:00.000Z' })
  createdAt!: Date;
}
