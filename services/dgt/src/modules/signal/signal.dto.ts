import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsNumber,
  IsMongoId,
  IsDateString,
  IsOptional,
  IsArray,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SignalTimeframe, SignalType, ConfidenceLabel, SignalStatus } from './signal.schema';

export class KeyFactorDto {
  @ApiProperty()
  @IsString()
  factor: string;

  @ApiProperty()
  @IsString()
  weight: string;
}

export class CreateSignalDto {
  @ApiProperty()
  @IsMongoId()
  accountId: string;

  @ApiProperty({ example: 'PAXGUSDT' })
  @IsString()
  asset: string;

  @ApiProperty({ enum: SignalTimeframe })
  @IsEnum(SignalTimeframe)
  timeframe: SignalTimeframe;

  @ApiProperty({ enum: SignalType })
  @IsEnum(SignalType)
  signalType: SignalType;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  confidence: number;

  @ApiProperty({ enum: ConfidenceLabel })
  @IsEnum(ConfidenceLabel)
  confidenceLabel: ConfidenceLabel;

  @ApiProperty()
  @IsString()
  insight: string;

  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  indicatorsUsed?: string[];

  @ApiProperty({ required: false, type: [KeyFactorDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KeyFactorDto)
  @IsOptional()
  keyFactors?: KeyFactorDto[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  llmModel?: string;

  @ApiProperty({ required: false, enum: SignalStatus })
  @IsEnum(SignalStatus)
  @IsOptional()
  status?: SignalStatus;

  @ApiProperty()
  @IsDateString()
  expiresAt: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  priceAtCreation?: number;
}

export class UpdateSignalDto {
  @ApiProperty({ required: false, enum: SignalStatus })
  @IsEnum(SignalStatus)
  @IsOptional()
  status?: SignalStatus;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  executedAt?: string;

  @ApiProperty({ required: false })
  @IsMongoId()
  @IsOptional()
  supersededBy?: string;
}
