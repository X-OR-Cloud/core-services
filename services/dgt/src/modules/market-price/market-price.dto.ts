import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsDateString, IsOptional } from 'class-validator';
import { MarketPriceSource, Timeframe } from './market-price.schema';

export class QueryMarketPriceDto {
  @ApiProperty({ example: 'XAUUSD' })
  @IsString()
  symbol: string;

  @ApiProperty({ enum: MarketPriceSource, required: false })
  @IsEnum(MarketPriceSource)
  @IsOptional()
  source?: string;

  @ApiProperty({ enum: Timeframe, required: false })
  @IsEnum(Timeframe)
  @IsOptional()
  timeframe?: string;

  @ApiProperty({ required: false, example: '2026-01-01T00:00:00Z' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiProperty({ required: false, example: '2026-03-03T00:00:00Z' })
  @IsDateString()
  @IsOptional()
  to?: string;
}
