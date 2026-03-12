import { IsString, IsEnum, IsOptional, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ConnectionConfigDto, ConnectionRouteDto } from './create-connection.dto';

export class UpdateConnectionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['active', 'inactive'], required: false })
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;

  @ApiProperty({ type: ConnectionConfigDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConnectionConfigDto)
  config?: ConnectionConfigDto;

  @ApiProperty({ type: [ConnectionRouteDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConnectionRouteDto)
  routes?: ConnectionRouteDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
