import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsNumber, IsOptional, IsMongoId, Min, Max } from 'class-validator';
import { PresetTemplate, RiskAppetite, TimeHorizon } from './risk-profile.schema';

export class CreateRiskProfileDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsMongoId()
  accountId: string;

  @ApiProperty({ enum: PresetTemplate, default: PresetTemplate.MODERATE })
  @IsEnum(PresetTemplate)
  @IsOptional()
  presetTemplate?: string;

  @ApiProperty({ enum: RiskAppetite, default: RiskAppetite.MEDIUM })
  @IsEnum(RiskAppetite)
  @IsOptional()
  riskAppetite?: string;

  @ApiProperty({ enum: TimeHorizon, default: TimeHorizon.SWING })
  @IsEnum(TimeHorizon)
  @IsOptional()
  timeHorizon?: string;

  @ApiProperty({ default: 15, minimum: 5, maximum: 30 })
  @IsNumber()
  @Min(5)
  @Max(30)
  @IsOptional()
  maxPositionSizePct?: number;

  @ApiProperty({ default: 3, minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  maxConcurrentPositions?: number;

  @ApiProperty({ default: 2.5, minimum: 0.5, maximum: 10 })
  @IsNumber()
  @Min(0.5)
  @Max(10)
  @IsOptional()
  stopLossPct?: number;

  @ApiProperty({ default: 5 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  takeProfitPct?: number;

  @ApiProperty({ default: 5, minimum: 2, maximum: 15 })
  @IsNumber()
  @Min(2)
  @Max(15)
  @IsOptional()
  maxDailyLossPct?: number;

  @ApiProperty({ default: 1.5, minimum: 0.5, maximum: 5 })
  @IsNumber()
  @Min(0.5)
  @Max(5)
  @IsOptional()
  riskPerTradePct?: number;

  @ApiProperty({ default: 2, minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  minRiskRewardRatio?: number;

  @ApiProperty({ default: 1, minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  leverage?: number;

  @ApiProperty({ default: 60, minimum: 50, maximum: 90 })
  @IsNumber()
  @Min(50)
  @Max(90)
  @IsOptional()
  minConfidenceScore?: number;
}

export class UpdateRiskProfileDto {
  @ApiProperty({ required: false, enum: PresetTemplate })
  @IsEnum(PresetTemplate)
  @IsOptional()
  presetTemplate?: string;

  @ApiProperty({ required: false, enum: RiskAppetite })
  @IsEnum(RiskAppetite)
  @IsOptional()
  riskAppetite?: string;

  @ApiProperty({ required: false, enum: TimeHorizon })
  @IsEnum(TimeHorizon)
  @IsOptional()
  timeHorizon?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(5)
  @Max(30)
  @IsOptional()
  maxPositionSizePct?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  maxConcurrentPositions?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0.5)
  @Max(10)
  @IsOptional()
  stopLossPct?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(1)
  @IsOptional()
  takeProfitPct?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(2)
  @Max(15)
  @IsOptional()
  maxDailyLossPct?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0.5)
  @Max(5)
  @IsOptional()
  riskPerTradePct?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  minRiskRewardRatio?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  leverage?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(50)
  @Max(90)
  @IsOptional()
  minConfidenceScore?: number;
}
