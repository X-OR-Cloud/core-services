import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { OutletStatus } from './outlet.schema';

export class CreateOutletDto {
  @ApiProperty({ description: 'Outlet name', example: 'Cơ sở Quận 1', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'Outlet address', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ description: 'Contact phone number', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;
}

export class UpdateOutletDto {
  @ApiPropertyOptional({ description: 'Outlet name', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Outlet address', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ description: 'Contact phone number', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;
}

export class UpdateOutletStatusDto {
  @ApiProperty({ enum: OutletStatus, description: 'New status' })
  @IsEnum(OutletStatus)
  status!: OutletStatus;
}
