import { IsString, IsEnum, IsOptional, IsObject, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class ChannelCredentialsDto {
  @ApiPropertyOptional({ description: 'Platform app ID' })
  @IsOptional()
  @IsString()
  appId?: string;

  @ApiPropertyOptional({ description: 'Platform app secret' })
  @IsOptional()
  @IsString()
  appSecret?: string;

  @ApiPropertyOptional({ description: 'Official Account ID (for Zalo OA)' })
  @IsOptional()
  @IsString()
  oaId?: string;

  @ApiPropertyOptional({ description: 'Access token' })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({ description: 'Refresh token' })
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiPropertyOptional({ description: 'Token expiration date' })
  @IsOptional()
  @IsDateString()
  tokenExpiresAt?: string;
}

export class ChannelWebhookDto {
  @ApiPropertyOptional({ description: 'Webhook verify token' })
  @IsOptional()
  @IsString()
  verifyToken?: string;

  @ApiPropertyOptional({ description: 'Webhook secret' })
  @IsOptional()
  @IsString()
  secret?: string;

  @ApiPropertyOptional({ description: 'Auto-generated webhook URL' })
  @IsOptional()
  @IsString()
  url?: string;
}

export class CreateChannelDto {
  @ApiProperty({ description: 'Channel name', example: 'TranGPT Zalo OA' })
  @IsString()
  name: string;

  @ApiProperty({ 
    description: 'Platform type',
    enum: ['zalo_oa', 'telegram', 'facebook', 'discord', 'whatsapp'],
    example: 'zalo_oa'
  })
  @IsEnum(['zalo_oa', 'telegram', 'facebook', 'discord', 'whatsapp'])
  platform: string;

  @ApiProperty({ 
    description: 'Channel status',
    enum: ['active', 'inactive', 'error'],
    default: 'inactive'
  })
  @IsEnum(['active', 'inactive', 'error'])
  status: string;

  @ApiPropertyOptional({ description: 'Platform credentials' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ChannelCredentialsDto)
  credentials?: ChannelCredentialsDto;

  @ApiPropertyOptional({ description: 'Webhook configuration' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ChannelWebhookDto)
  webhook?: ChannelWebhookDto;

  @ApiPropertyOptional({ description: 'Default bot/soul ID to use for this channel' })
  @IsOptional()
  @IsString()
  defaultBotId?: string;
}

export class UpdateChannelDto extends PartialType(CreateChannelDto) {}

export class ChannelResponseDto extends CreateChannelDto {
  @ApiProperty({ description: 'Unique channel ID' })
  _id: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}