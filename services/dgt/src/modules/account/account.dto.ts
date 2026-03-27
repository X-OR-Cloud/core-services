import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsNumber, IsBoolean, IsOptional, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AccountType, Exchange, AccountStatus } from './account.schema';

/**
 * DTO để test API key TRƯỚC khi tạo account.
 * Server sẽ test connection với exchange và trả về testToken (Redis one-time token, TTL 10 phút).
 * Dùng testToken này trong CreateAccountDto để tạo account — không cần gửi lại apiKey/apiSecret.
 */
export class TestApiKeyDto {
  @ApiProperty({ enum: Exchange, default: Exchange.BINANCE, description: 'Exchange cần test' })
  @IsEnum(Exchange)
  exchange: string;

  @ApiProperty({ enum: AccountType, default: AccountType.PAPER, description: 'Loại account (live/paper)' })
  @IsEnum(AccountType)
  accountType: string;

  @ApiProperty({ description: 'API Key từ exchange' })
  @IsString()
  apiKey: string;

  @ApiProperty({ description: 'API Secret từ exchange' })
  @IsString()
  apiSecret: string;

  @ApiProperty({ required: false, default: 'USDT', description: 'Currency để lấy balance' })
  @IsString()
  @IsOptional()
  currency?: string;
}

export class CreateAccountDto {
  /**
   * Token nhận từ POST /accounts/test-key (bắt buộc khi gọi qua API).
   * Server sẽ lấy apiKey/apiSecret đã verify từ Redis.
   * exchange, accountType, currency được lấy từ token — không cần gửi lại.
   */
  @ApiProperty({
    description: 'Token nhận từ POST /accounts/test-key (TTL 10 phút, one-time use). Bắt buộc khi tạo account.',
  })
  @IsString()
  testToken: string;

  @ApiProperty({ required: false, example: 'My Binance Account' })
  @IsString()
  @IsOptional()
  label?: string;

  @ApiProperty({ default: 0, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  initialBalance?: number;

  @ApiProperty({ default: false, required: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

/**
 * DTO nội bộ cho system calls (VD: iam-event.processor auto-create default account).
 * Không dùng cho external API — không có testToken requirement.
 */
export class CreateAccountInternalDto {
  accountType?: string;
  exchange?: string;
  label?: string;
  initialBalance?: number;
  currency?: string;
  isDefault?: boolean;
  apiKey?: string;
  apiSecret?: string;
  testToken?: string;
}

export class NotificationsConfigDto {
  @ApiProperty({ required: false, example: 'https://discord.com/api/webhooks/...' })
  @IsString()
  @IsOptional()
  discordWebhookUrl?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  telegramBotToken?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  telegramChatId?: string;

  @ApiProperty({ required: false, description: 'Telegram topic/thread ID for supergroups' })
  @IsString()
  @IsOptional()
  telegramThreadId?: string;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateAccountDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  label?: string;

  @ApiProperty({ required: false, enum: AccountStatus })
  @IsEnum(AccountStatus)
  @IsOptional()
  status?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiProperty({ required: false, description: 'New API Key — must be provided together with apiSecret' })
  @IsString()
  @IsOptional()
  apiKey?: string;

  @ApiProperty({ required: false, description: 'New API Secret — must be provided together with apiKey' })
  @IsString()
  @IsOptional()
  apiSecret?: string;

  @ApiProperty({ required: false, type: NotificationsConfigDto })
  @ValidateNested()
  @Type(() => NotificationsConfigDto)
  @IsOptional()
  notifications?: NotificationsConfigDto;
}
