import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsObject } from 'class-validator';
import { PaginationQueryDto } from '@hydrabyte/base';

const PROVIDER_TYPES = ['payment-gateway', 'einvoice'] as const;
const PROVIDER_STATUSES = ['inactive', 'active', 'error'] as const;

export class CreateProviderDto {
  @ApiProperty({ enum: PROVIDER_TYPES, example: 'payment-gateway' })
  @IsEnum(PROVIDER_TYPES)
  type!: string;

  @ApiProperty({ example: 'payos', description: "Provider slug: 'payos' | 'vnpay' | 'misa' | ..." })
  @IsString()
  provider!: string;

  @ApiProperty({ example: 'PayOS Production' })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Provider credentials as plain JSON — will be AES-256-GCM encrypted at rest. ' +
      'PayOS example: { clientId, apiKey, checksumKey, env }. ' +
      'MISA example: { apiKey, taxCode, username, password }.',
    example: { clientId: '...', apiKey: '...', checksumKey: '...', env: 'production' },
  })
  @IsObject()
  config!: Record<string, any>;
}

export class UpdateProviderDto {
  @ApiPropertyOptional({ example: 'PayOS Sandbox' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: PROVIDER_STATUSES })
  @IsOptional()
  @IsEnum(PROVIDER_STATUSES)
  status?: string;
}

export class UpdateProviderConfigDto {
  @ApiProperty({
    description: 'New provider credentials — fully replaces existing config.',
    example: { clientId: '...', apiKey: '...', checksumKey: '...', env: 'production' },
  })
  @IsObject()
  config!: Record<string, any>;
}

export class ProviderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PROVIDER_TYPES })
  @IsOptional()
  @IsEnum(PROVIDER_TYPES)
  type?: string;
}
