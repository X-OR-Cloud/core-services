import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsDateString, IsOptional } from 'class-validator';

export class QueryMacroIndicatorDto {
  @ApiProperty({ example: 'FEDFUNDS', required: false })
  @IsString()
  @IsOptional()
  seriesId?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  to?: string;
}
