import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsNumber, IsMongoId, IsOptional, Min } from 'class-validator';
import { OrderSide, OrderType, OrderStatus } from './order.schema';

export class CreateOrderDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsMongoId()
  accountId: string;

  @ApiProperty({ example: 'PAXGUSDT' })
  @IsString()
  symbol: string;

  @ApiProperty({ enum: OrderSide })
  @IsEnum(OrderSide)
  side: string;

  @ApiProperty({ enum: OrderType })
  @IsEnum(OrderType)
  orderType: string;

  @ApiProperty({ example: 0.1 })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  price?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  stopLossPrice?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  takeProfitPrice?: number;
}

export class UpdateOrderDto {
  @ApiProperty({ required: false, enum: OrderStatus })
  @IsEnum(OrderStatus)
  @IsOptional()
  status?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  price?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  stopLossPrice?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  takeProfitPrice?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  rejectionReason?: string;
}
