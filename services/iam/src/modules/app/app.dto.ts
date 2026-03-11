import { IsNotEmpty, IsOptional, IsString, IsBoolean, IsArray, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AppStatus } from './app.schema';

export class CreateAppDTO {
  @ApiProperty({ description: 'App name', example: 'Kaisar Platform' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: 'App description', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Allowed email domains for Google SSO auto-provisioning',
    example: ['kaisar.io', 'x-or.cloud'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  allowedDomains: string[];

  @ApiProperty({ description: 'Default orgId assigned to new Google SSO users', example: '691eb9e6517f917943ae1f9d' })
  @IsNotEmpty()
  @IsString()
  defaultOrgId: string;

  @ApiProperty({ description: 'Default role assigned to new Google SSO users', example: 'organization.viewer', required: false })
  @IsOptional()
  @IsString()
  defaultRole?: string;

  @ApiProperty({ description: 'Enable Google SSO for this app', example: true, required: false })
  @IsOptional()
  @IsBoolean()
  ssoEnabled?: boolean;
}

export class UpdateAppDTO {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedDomains?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  defaultOrgId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  defaultRole?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  ssoEnabled?: boolean;

  @ApiProperty({ enum: AppStatus, required: false })
  @IsOptional()
  @IsEnum(AppStatus)
  status?: AppStatus;
}
