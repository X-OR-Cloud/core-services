import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsArray,
  MinLength,
  MaxLength,
  IsIn,
} from 'class-validator';

export class CreateStaffDto {
  @ApiProperty({ description: 'Email address (used as username in IAM)', example: 'nhanvien@bepcoba.shop' })
  @IsEmail()
  username!: string;

  @ApiPropertyOptional({
    description: 'Password (8-15 chars, uppercase, lowercase, number, special char). Auto-generated if not provided.',
    example: 'Pass@1234',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(15)
  password?: string;

  @ApiPropertyOptional({ description: 'Full name', example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  fullname?: string;

  @ApiPropertyOptional({ description: 'Phone numbers', example: ['+84901234567'] })
  @IsOptional()
  @IsArray()
  phonenumbers?: string[];

  @ApiPropertyOptional({ description: 'Address' })
  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateStaffDto {
  @ApiPropertyOptional({ description: 'Status', enum: ['active', 'inactive'] })
  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: string;

  @ApiPropertyOptional({ description: 'Full name' })
  @IsOptional()
  @IsString()
  fullname?: string;

  @ApiPropertyOptional({ description: 'Phone numbers' })
  @IsOptional()
  @IsArray()
  phonenumbers?: string[];

  @ApiPropertyOptional({ description: 'Address' })
  @IsOptional()
  @IsString()
  address?: string;
}

export class ResetPasswordDto {
  @ApiPropertyOptional({
    description: 'New password (8-15 chars, uppercase, lowercase, number, special char). Auto-generated if not provided.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(15)
  newPassword?: string;
}
