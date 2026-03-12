import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ConnectionConfigDto {
  @ApiProperty({ description: 'Bot token from Discord/Telegram' })
  @IsString()
  botToken: string;

  @ApiProperty({ description: 'Discord application/client ID', required: false })
  @IsOptional()
  @IsString()
  applicationId?: string;

  @ApiProperty({ description: 'Telegram webhook public URL', required: false })
  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @ApiProperty({ description: 'Telegram: use long-polling (default true)', required: false })
  @IsOptional()
  @IsBoolean()
  pollingMode?: boolean;
}

export class ConnectionRouteDto {
  @ApiProperty({ description: 'Discord server (guild) ID', required: false })
  @IsOptional()
  @IsString()
  guildId?: string;

  @ApiProperty({ description: 'Discord channel ID or Telegram chatId', required: false })
  @IsOptional()
  @IsString()
  channelId?: string;

  @ApiProperty({ description: 'Filter by specific bot ID', required: false })
  @IsOptional()
  @IsString()
  botId?: string;

  @ApiProperty({ description: 'Only reply when @mentioned (Discord)', required: false })
  @IsOptional()
  @IsBoolean()
  requireMention?: boolean;

  @ApiProperty({ description: 'Target agent ID' })
  @IsString()
  agentId: string;

  @ApiProperty({ description: 'Allow users not in org (default true)', required: false })
  @IsOptional()
  @IsBoolean()
  allowAnonymous?: boolean;
}

export class CreateConnectionDto {
  @ApiProperty({ description: 'Connection name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Connection description', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['discord', 'telegram'] })
  @IsEnum(['discord', 'telegram'])
  provider: string;

  @ApiProperty({ type: ConnectionConfigDto })
  @ValidateNested()
  @Type(() => ConnectionConfigDto)
  config: ConnectionConfigDto;

  @ApiProperty({ type: [ConnectionRouteDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConnectionRouteDto)
  routes?: ConnectionRouteDto[];
}
