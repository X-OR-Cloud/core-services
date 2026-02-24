import { Matches, IsNotEmpty, IsObject, IsArray, IsEnum, IsOptional, IsString } from "class-validator";
import { ApiProperty } from '@nestjs/swagger';
import { UsernameRegex, InvalidUsernameMessage, PasswordRegex, InvalidPasswordMessage, EmailRegex } from "../../core/const/iam.const";
import { UserStatuses } from "../../core/enums/user.enum";
import { UserMetadata } from "./user.schema";

// Phone number regex: supports formats like +84123456789, 0123456789, +1-234-567-8900
const PhoneNumberRegex = /^(\+?\d{1,3}[-.\s]?)?(\(?\d{1,4}\)?[-.\s]?)?[\d\s.-]{7,15}$/;
const InvalidPhoneNumberMessage = 'Invalid phone number format. Examples: +84123456789, 0123456789, +1-234-567-8900';

export class CreateUserData {
  @ApiProperty({
    description: 'Email address (valid email format)',
    example: 'john.doe@example.com',
    pattern: EmailRegex.source,
  })
  @Matches(EmailRegex, {
    message: 'Invalid email address format',
  })
  @IsNotEmpty()
  username = '';

  @ApiProperty({
    description: 'Password (8-15 chars, uppercase, lowercase, number, special char)',
    example: 'SecureP@ss123',
    pattern: PasswordRegex.source,
  })
  @Matches(PasswordRegex, {
    message: InvalidPasswordMessage,
  })
  @IsNotEmpty()
  password = '';

  @ApiProperty({
    description: 'User role (scope.role format)',
    example: 'organization.owner',
  })
  @IsString()
  @IsNotEmpty()
  role: string;

  @ApiProperty({
    description: 'User status',
    enum: UserStatuses,
    default: UserStatuses.Active,
    example: UserStatuses.Active,
  })
  @IsEnum(UserStatuses)
  status: UserStatuses = UserStatuses.Active;

  @ApiProperty({
    description: 'Full name of the user',
    example: 'John Doe',
    required: false,
  })
  @IsString()
  @IsOptional()
  fullname?: string;

  @ApiProperty({
    description: 'Phone numbers (supports international formats with country code)',
    example: ['+84123456789', '0987654321'],
    type: [String],
    required: false,
  })
  @IsArray()
  @IsOptional()
  @Matches(PhoneNumberRegex, {
    each: true,
    message: InvalidPhoneNumberMessage,
  })
  phonenumbers?: string[];

  @ApiProperty({
    description: 'User address',
    example: '123 Main St, New York, NY 10001, USA',
    required: false,
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({
    description: 'User metadata with predefined fields for social accounts',
    example: {
      discordUserId: '123456789012345678',
      discordUsername: 'johndoe#1234',
      telegramUserId: '987654321',
      telegramUsername: '@johndoe',
      customField: 'custom value'
    },
    required: false,
  })
  @IsObject()
  @IsOptional()
  metadata?: UserMetadata;
}

export class UpdateUserData {
  @ApiProperty({
    description: 'User status',
    enum: UserStatuses,
    required: false,
    example: UserStatuses.Active,
  })
  @IsEnum(UserStatuses)
  @IsOptional()
  status?: UserStatuses;

  @ApiProperty({
    description: 'Full name of the user',
    example: 'John Doe',
    required: false,
  })
  @IsString()
  @IsOptional()
  fullname?: string;

  @ApiProperty({
    description: 'Phone numbers (supports international formats with country code)',
    example: ['+84123456789', '0987654321'],
    type: [String],
    required: false,
  })
  @IsArray()
  @IsOptional()
  @Matches(PhoneNumberRegex, {
    each: true,
    message: InvalidPhoneNumberMessage,
  })
  phonenumbers?: string[];

  @ApiProperty({
    description: 'User address',
    example: '123 Main St, New York, NY 10001, USA',
    required: false,
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({
    description: 'User metadata with predefined fields for social accounts',
    example: {
      discordUserId: '123456789012345678',
      discordUsername: 'johndoe#1234',
      telegramUserId: '987654321',
      telegramUsername: '@johndoe',
      customField: 'custom value'
    },
    required: false,
  })
  @IsObject()
  @IsOptional()
  metadata?: UserMetadata;
}

export class ChangeRoleDto {
  @ApiProperty({
    description: 'New role (organization-level only: organization.owner, organization.editor, organization.viewer)',
    example: 'organization.editor',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^organization\.(owner|editor|viewer)$/, {
    message: 'Role must be one of: organization.owner, organization.editor, organization.viewer',
  })
  role: string;
}

export class ChangePasswordDto {
  @ApiProperty({
    description: 'New password (8-15 chars, uppercase, lowercase, number, special char)',
    example: 'NewP@ssw0rd',
    pattern: PasswordRegex.source,
  })
  @Matches(PasswordRegex, {
    message: InvalidPasswordMessage,
  })
  @IsNotEmpty()
  newPassword: string;
}
