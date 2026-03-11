import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type AccountDocument = Account & Document;

export enum AccountType {
  LIVE = 'live',
  PAPER = 'paper',
}

export enum Exchange {
  BINANCE = 'binance',
  OKX = 'okx',
  BYBIT = 'bybit',
}

export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
}

@Schema({ timestamps: true })
export class Account extends BaseSchema {
  @Prop({ required: true, enum: AccountType, default: AccountType.PAPER })
  accountType: string;

  @Prop({ required: true, enum: Exchange, default: Exchange.BINANCE })
  exchange: string;

  @Prop()
  label: string;

  @Prop({ required: true, default: 0 })
  balance: number;

  @Prop({ required: true, default: 0 })
  initialBalance: number;

  @Prop({ required: true, default: 'USDT' })
  currency: string;

  @Prop({ required: true, enum: AccountStatus, default: AccountStatus.ACTIVE })
  status: string;

  @Prop({ required: true, default: false })
  isDefault: boolean;

  @Prop({
    type: {
      discordWebhookUrl: { type: String, default: '' },
      telegramBotToken: { type: String, default: '' },
      telegramChatId: { type: String, default: '' },
      enabled: { type: Boolean, default: false },
    },
    default: {},
  })
  notifications!: {
    discordWebhookUrl?: string;
    telegramBotToken?: string;
    telegramChatId?: string;
    enabled?: boolean;
  };
}

export const AccountSchema = SchemaFactory.createForClass(Account);

AccountSchema.index({ 'owner.userId': 1, accountType: 1, exchange: 1 });
