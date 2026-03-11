import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsNumber,
  IsMongoId,
  IsOptional,
  IsDateString,
  IsObject,
  Min,
  Max,
} from 'class-validator';
import { BotStatus, BotTimeframe, TradingMode } from './bot.schema';

export class CreateBotDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsMongoId()
  accountId: string;

  @ApiProperty({ example: 'My Gold Bot' })
  @IsString()
  name: string;

  @ApiProperty({ enum: TradingMode })
  @IsEnum(TradingMode)
  tradingMode: TradingMode;

  @ApiProperty({ required: false, example: 'PAXGUSDT' })
  @IsString()
  @IsOptional()
  asset?: string;

  @ApiProperty({ enum: BotTimeframe })
  @IsEnum(BotTimeframe)
  timeframe: BotTimeframe;

  @ApiProperty({ example: 10000 })
  @IsNumber()
  @Min(1)
  totalCapital: number;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @Min(1)
  maxEntrySize: number;

  @ApiProperty({ example: 2.5 })
  @IsNumber()
  @Min(0.1)
  @Max(100)
  stopLoss: number;

  @ApiProperty({ example: 5.0 })
  @IsNumber()
  @Min(0.1)
  @Max(100)
  takeProfit: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(1)
  @Max(15)
  maxDrawdownLimit: number;

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(1)
  dailyStopLossUSD: number;

  @ApiProperty({ required: false, example: 70 })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  minConfidenceScore?: number;
}

export class UpdateBotDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false, enum: TradingMode })
  @IsEnum(TradingMode)
  @IsOptional()
  tradingMode?: TradingMode;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  totalCapital?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  maxEntrySize?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  stopLoss?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  takeProfit?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  maxDrawdownLimit?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  dailyStopLossUSD?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  minConfidenceScore?: number;

  @ApiProperty({ required: false, enum: BotStatus })
  @IsEnum(BotStatus)
  @IsOptional()
  status?: BotStatus;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  errorMessage?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  lastActiveAt?: string;

  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  stats?: object;
}

export class UpdateBotStatusDto {
  @ApiProperty({ enum: BotStatus })
  @IsEnum(BotStatus)
  status: BotStatus;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  errorMessage?: string;
}
