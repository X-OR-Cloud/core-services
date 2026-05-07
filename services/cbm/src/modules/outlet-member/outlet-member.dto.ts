import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateOutletMemberDto {
  @ApiProperty({ description: 'Outlet ID to assign', example: '6123abc...' })
  @IsString()
  outletId!: string;

  @ApiProperty({ description: 'User ID to assign', example: 'user_123' })
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ description: 'Set as default outlet for this user', default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateOutletMemberDto {
  @ApiPropertyOptional({ description: 'Set as default outlet for this user' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class SetDefaultOutletDto {
  @ApiProperty({ description: 'Outlet member ID to set as default' })
  @IsString()
  outletMemberId!: string;
}
