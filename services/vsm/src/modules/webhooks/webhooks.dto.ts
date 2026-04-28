import { IsString, IsOptional, IsObject, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AmiEventDto {
  @ApiProperty({ description: 'AMI event name, e.g. Cdr, PeerStatus, DeviceStateChange' })
  @IsString()
  event: string;

  @ApiProperty({ description: 'Asterisk node ID that emitted the event' })
  @IsString()
  nodeId: string;

  @ApiProperty({ description: 'Raw AMI event payload' })
  @IsObject()
  payload: Record<string, any>;
}

export class SyncResultDto {
  @ApiProperty({ description: 'Entity ID that was synced' })
  @IsString()
  entityId: string;

  @ApiProperty({ enum: ['account', 'trunk', 'dialplan'] })
  @IsString()
  entityType: string;

  @ApiProperty({ enum: ['synced', 'error'] })
  @IsEnum(['synced', 'error'])
  status: string;

  @ApiPropertyOptional({ description: 'Error message if status is error' })
  @IsOptional()
  @IsString()
  error?: string;
}
