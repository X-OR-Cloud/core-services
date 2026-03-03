import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsDateString, IsOptional } from 'class-validator';
import { SentimentSource } from './sentiment-signal.schema';

export class QuerySentimentSignalDto {
  @ApiProperty({ enum: SentimentSource, required: false })
  @IsEnum(SentimentSource)
  @IsOptional()
  source?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  to?: string;
}
