import { IsString, IsOptional, IsNumber, IsObject, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

class AmiConfigDto {
  @ApiPropertyOptional({ default: 5038 }) @IsOptional() @IsNumber() port?: number;
  @ApiProperty() @IsString() username: string;
  @ApiProperty() @IsString() secret: string;
}

class WssConfigDto {
  @ApiProperty() @IsString() hostname: string;
  @ApiPropertyOptional({ default: 8089 }) @IsOptional() @IsNumber() port?: number;
  @ApiPropertyOptional({ default: '/ws' }) @IsOptional() @IsString() path?: string;
}

export class CreateNodeDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() hostname: string;
  @ApiProperty({ type: AmiConfigDto }) @IsObject() @ValidateNested() @Type(() => AmiConfigDto) ami: AmiConfigDto;
  @ApiPropertyOptional({ type: WssConfigDto }) @IsOptional() @IsObject() @ValidateNested() @Type(() => WssConfigDto) wss?: WssConfigDto;
}

export class UpdateNodeDto extends PartialType(CreateNodeDto) {}
