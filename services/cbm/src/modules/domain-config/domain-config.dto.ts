import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsBoolean, IsObject, IsOptional, MaxLength } from 'class-validator';

export class CreateDomainConfigDto {
  @ApiProperty({ example: 'booking', description: 'Domain name for this config' })
  @IsString()
  @MaxLength(100)
  domain!: string;

  @ApiPropertyOptional({ example: 'default' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  extends?: string;

  @ApiProperty({ example: 'order', description: 'Resource this config applies to' })
  @IsString()
  @MaxLength(50)
  resource!: string;

  @ApiProperty({ description: 'Workflow config object (states + actions)' })
  @IsObject()
  config!: Record<string, any>;
}

export class UpdateDomainConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  domain?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  extends?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
