import { IsString, IsOptional, IsNumber, IsArray, IsMongoId, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateTrunkDto {
  @ApiProperty({ description: 'Asterisk node ID' })
  @IsMongoId()
  nodeId: string;

  @ApiProperty({ description: 'Trunk name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'SIP provider host or IP' })
  @IsString()
  host: string;

  @ApiPropertyOptional({ description: 'SIP port', default: 5060 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiProperty({ description: 'SIP username' })
  @IsString()
  username: string;

  @ApiProperty({ description: 'SIP password (will be encrypted at rest)' })
  @IsString()
  password: string;

  @ApiPropertyOptional({ type: [String], description: 'Codec list', default: ['ulaw', 'alaw'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  codecs?: string[];
}

export class UpdateTrunkDto extends PartialType(CreateTrunkDto) {}
