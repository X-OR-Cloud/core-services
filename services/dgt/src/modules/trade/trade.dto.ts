import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsNumber, IsMongoId, IsDateString, IsOptional, Min } from 'class-validator';

export class ExecuteFromSignalDto {
  @ApiProperty()
  @IsMongoId()
  signalId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ required: false })
  @IsMongoId()
  @IsOptional()
  accountId?: string;
}
import { OrderSide } from '../order/order.schema';

export class CreateTradeDto {
  @ApiProperty()
  @IsMongoId()
  accountId: string;

  @ApiProperty()
  @IsMongoId()
  orderId: string;

  @ApiProperty({ example: 'PAXGUSDT' })
  @IsString()
  symbol: string;

  @ApiProperty({ enum: OrderSide })
  @IsEnum(OrderSide)
  side: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  filledPrice: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  filledQuantity: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  notionalUsd: number;

  @ApiProperty({ required: false, default: 0 })
  @IsNumber()
  @IsOptional()
  fees?: number;

  @ApiProperty()
  @IsDateString()
  executedAt: string;
}
