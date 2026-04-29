import { IsString, IsOptional, IsEnum, IsNumber, IsMongoId, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateRouteDto {
  @ApiProperty({ description: 'Route name' })
  @IsString()
  name: string;

  @ApiProperty({ enum: ['inbound', 'outbound'] })
  @IsEnum(['inbound', 'outbound'])
  direction: string;

  @ApiPropertyOptional({ description: 'Priority — lower value = higher priority', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional({ description: 'Match number pattern (regex or exact)' })
  @IsOptional()
  @IsString()
  matchNumber?: string;

  @ApiPropertyOptional({ description: 'Originating account ID (outbound)' })
  @IsOptional()
  @IsMongoId()
  fromAccountId?: string;

  @ApiPropertyOptional({ description: 'Destination account ID (inbound)' })
  @IsOptional()
  @IsMongoId()
  toAccountId?: string;

  @ApiPropertyOptional({ description: 'Via trunk ID (outbound)' })
  @IsOptional()
  @IsMongoId()
  toTrunkId?: string;

  @ApiPropertyOptional({ description: 'Forward to dialplan context' })
  @IsOptional()
  @IsMongoId()
  toDialplanId?: string;
}

export class UpdateRouteDto extends PartialType(CreateRouteDto) {}
