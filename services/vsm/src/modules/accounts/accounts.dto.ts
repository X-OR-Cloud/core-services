import { IsString, IsOptional, IsEnum, IsArray, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateAccountDto {
  @ApiProperty({ description: 'Asterisk node ID' })
  @IsMongoId()
  nodeId: string;

  @ApiPropertyOptional({ description: 'Linked user ID' })
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @ApiProperty({ description: 'Extension number' })
  @IsString()
  ext: string;

  @ApiProperty({ description: 'Display name' })
  @IsString()
  displayName: string;

  @ApiProperty({ description: 'SIP password (will be encrypted at rest)' })
  @IsString()
  password: string;

  @ApiProperty({ enum: ['sip', 'webrtc'], description: 'Transport protocol' })
  @IsEnum(['sip', 'webrtc'])
  protocol: string;

  @ApiPropertyOptional({ type: [String], description: 'Codec list', default: ['ulaw', 'alaw'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  codecs?: string[];
}

export class UpdateAccountDto extends PartialType(CreateAccountDto) {}
