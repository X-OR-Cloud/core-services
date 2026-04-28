import { IsString, IsOptional, IsEnum, IsMongoId, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OriginateCallDto {
  @ApiProperty({ description: 'Asterisk node ID' })
  @IsMongoId()
  nodeId: string;

  @ApiProperty({ description: 'Source account ID (SIP channel to dial first)' })
  @IsMongoId()
  fromAccountId: string;

  @ApiProperty({ description: 'Destination number to dial' })
  @IsString()
  toNumber: string;

  @ApiPropertyOptional({ description: 'Caller ID number override' })
  @IsOptional()
  @IsString()
  fromNumber?: string;

  @ApiProperty({ enum: ['manual', 'click-to-call', 'auto'], description: 'Call mode' })
  @IsEnum(['manual', 'click-to-call', 'auto'])
  mode: string;

  @ApiPropertyOptional({ description: 'Trunk ID to use for outbound (if routing via trunk)' })
  @IsOptional()
  @IsMongoId()
  trunkId?: string;

  @ApiPropertyOptional({ description: 'Dialplan context to use' })
  @IsOptional()
  @IsString()
  dialplanContext?: string;
}

export class ScheduleAutoCallDto extends OriginateCallDto {
  @ApiProperty({ description: 'Scheduled time in ISO 8601 format' })
  @IsDateString()
  scheduledAt: string;
}
