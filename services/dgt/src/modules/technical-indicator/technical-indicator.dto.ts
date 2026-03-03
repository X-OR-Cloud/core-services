import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsDateString, IsOptional } from 'class-validator';
import { Timeframe } from '../market-price/market-price.schema';

export class QueryTechnicalIndicatorDto {
  @ApiProperty({ example: 'XAUUSD' })
  @IsString()
  symbol: string;

  @ApiProperty({ enum: Timeframe, required: false })
  @IsEnum(Timeframe)
  @IsOptional()
  timeframe?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  to?: string;
}
