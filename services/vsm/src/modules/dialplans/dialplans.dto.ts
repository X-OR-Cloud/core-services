import { IsString, IsOptional, IsNumber, IsArray, IsMongoId, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

class DialplanExtensionDto {
  @ApiProperty({ description: 'Extension pattern, e.g. _X., s, 100' })
  @IsString()
  exten: string;

  @ApiProperty({ description: 'Priority (1 = first)' })
  @IsNumber()
  @Min(1)
  priority: number;

  @ApiProperty({ description: 'Asterisk application, e.g. Dial, Answer, Hangup' })
  @IsString()
  app: string;

  @ApiPropertyOptional({ description: 'Application arguments' })
  @IsOptional()
  @IsString()
  appData?: string;
}

export class CreateDialplanDto {
  @ApiProperty({ description: 'Asterisk node ID' })
  @IsMongoId()
  nodeId: string;

  @ApiProperty({ description: 'Dialplan name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Asterisk context name, e.g. from-internal' })
  @IsString()
  context: string;

  @ApiPropertyOptional({ type: [DialplanExtensionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DialplanExtensionDto)
  extensions?: DialplanExtensionDto[];
}

export class UpdateDialplanDto extends PartialType(CreateDialplanDto) {}
