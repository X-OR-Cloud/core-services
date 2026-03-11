import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsNumber, IsBoolean, IsOptional, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AccountType, Exchange, AccountStatus } from './account.schema';

export class CreateAccountDto {
  @ApiProperty({ enum: AccountType, default: AccountType.PAPER })
  @IsEnum(AccountType)
  @IsOptional()
  accountType?: string;

  @ApiProperty({ enum: Exchange, default: Exchange.BINANCE })
  @IsEnum(Exchange)
  @IsOptional()
  exchange?: string;

  @ApiProperty({ required: false, example: 'My Paper Account' })
  @IsString()
  @IsOptional()
  label?: string;

  @ApiProperty({ default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  initialBalance?: number;

  @ApiProperty({ default: 'USDT' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({ default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
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

  @ApiProperty({ required: false, type: NotificationsConfigDto })
  @ValidateNested()
  @Type(() => NotificationsConfigDto)
  @IsOptional()
  notifications?: NotificationsConfigDto;
}
