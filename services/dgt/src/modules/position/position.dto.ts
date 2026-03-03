import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsNumber, IsMongoId, IsDateString, IsOptional, Min } from 'class-validator';
import { PositionSide, PositionStatus, CloseReason } from './position.schema';

export class CreatePositionDto {
  @ApiProperty()
  @IsMongoId()
  accountId: string;

  @ApiProperty({ example: 'PAXGUSDT' })
  @IsString()
  symbol: string;

  @ApiProperty({ enum: PositionSide })
  @IsEnum(PositionSide)
  side: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  entryPrice: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  notionalUsd: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  stopLossPrice?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  takeProfitPrice?: number;

  @ApiProperty({ default: 1 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  leverage?: number;

  @ApiProperty()
  @IsDateString()
  openedAt: string;
}

export class UpdatePositionDto {
  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  currentPrice?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  unrealizedPnl?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  unrealizedPnlPct?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  stopLossPrice?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  takeProfitPrice?: number;

  @ApiProperty({ required: false, enum: PositionStatus })
  @IsEnum(PositionStatus)
  @IsOptional()
  status?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  realizedPnl?: number;

  @ApiProperty({ required: false, enum: CloseReason })
  @IsEnum(CloseReason)
  @IsOptional()
  closeReason?: string;
}
