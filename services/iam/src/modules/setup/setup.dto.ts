import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { PasswordRegex, InvalidPasswordMessage, EmailRegex } from '../../core/const/iam.const';

export class SetupInitializeDto {
  @ApiProperty({ description: 'Organization name', example: 'My Company' })
  @IsString()
  @IsNotEmpty()
  orgName: string;

  @ApiProperty({ description: 'Organization description', example: 'Main organization', required: false })
  @IsString()
  @IsOptional()
  orgDescription?: string;

  @ApiProperty({ description: 'Admin email (universe.owner)', example: 'admin@example.com' })
  @Matches(EmailRegex, { message: 'Invalid email address format' })
  @IsNotEmpty()
  adminUsername: string;

  @ApiProperty({ description: 'Admin password (8-15 chars, uppercase, lowercase, number, special char)', example: 'Admin@1234' })
  @Matches(PasswordRegex, { message: InvalidPasswordMessage })
  @IsNotEmpty()
  adminPassword: string;

  @ApiProperty({ description: 'Admin full name', example: 'Administrator', required: false })
  @IsString()
  @IsOptional()
  adminFullname?: string;
}

export class SetupStatusResponse {
  @ApiProperty({ description: 'Whether the system has been initialized' })
  initialized: boolean;
}

export class SetupInitializeResponse {
  @ApiProperty()
  orgId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  username: string;
}
