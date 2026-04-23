import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ConversationMode } from '../connection.schema';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ConnectionConfigDto {
  @ApiProperty({ description: 'Bot token from Discord/Telegram', required: false })
  @IsOptional()
  @IsString()
  botToken?: string;

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

  @ApiProperty({ description: 'Teams: Microsoft App ID', required: false })
  @IsOptional()
  @IsString()
  appId?: string;

  @ApiProperty({ description: 'Teams: Azure AD client secret', required: false })
  @IsOptional()
  @IsString()
  appPassword?: string;

  @ApiProperty({ description: 'Teams: Azure AD tenant ID', required: false })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ description: 'Zalo Bot: secret token to validate incoming webhook requests', required: false })
  @IsOptional()
  @IsString()
  zaloSecretToken?: string;
}

export class ConnectionRouteDto {
  @ApiProperty({ description: 'Discord: guild ID | Telegram: chat.id (group) | Teams: teamId', required: false })
  @IsOptional()
  @IsString()
  serverId?: string;

  @ApiProperty({ description: 'Discord: channel ID | Telegram: message_thread_id (topic) | Teams: channelId', required: false })
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

  @ApiProperty({ enum: ['user', 'connection', 'shared'], required: false })
  @IsOptional()
  @IsEnum(['user', 'connection', 'shared'])
  conversationMode?: ConversationMode;

  @ApiProperty({ description: "Action types to forward to main channel: [] = message only, ['*'] = all, ['thinking','tool_use','notice'] = selective", required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  verboseActions?: string[];

  @ApiProperty({ description: 'Channel ID to receive ALL actions regardless of verboseActions. Leave empty to disable verbose log forwarding.', required: false })
  @IsOptional()
  @IsString()
  verboseLogsChannelId?: string;
}

export class CreateConnectionDto {
  @ApiProperty({ description: 'Connection name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Connection description', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['discord', 'telegram', 'teams', 'zalo-bot'] })
  @IsEnum(['discord', 'telegram', 'teams', 'zalo-bot'])
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
