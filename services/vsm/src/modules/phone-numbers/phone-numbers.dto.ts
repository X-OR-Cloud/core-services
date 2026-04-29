import { IsString, IsOptional, IsEnum, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreatePhoneNumberDto {
  @ApiProperty({ description: 'Asterisk node ID' })
  @IsMongoId()
  nodeId: string;

  @ApiProperty({ description: 'Phone number in E.164 format (e.g. +84901234567)' })
  @IsString()
  number: string;

  @ApiPropertyOptional({ enum: ['inbound', 'outbound', 'both'], default: 'both' })
  @IsOptional()
  @IsEnum(['inbound', 'outbound', 'both'])
  direction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdatePhoneNumberDto extends PartialType(CreatePhoneNumberDto) {}
