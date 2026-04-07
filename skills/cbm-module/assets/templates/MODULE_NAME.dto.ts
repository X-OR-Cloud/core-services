import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsObject,
  IsNumber,
  IsDateString,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// TODO: Add nested object DTOs here if needed
// export class MODULE_CLASSAddressDto {
//   @ApiPropertyOptional() @IsOptional() @IsString() street?: string;
//   @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
//   @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
// }

export class CreateMODULE_CLASSDto {
  // ==============================
  // TODO: Add fields below
  // ==============================

  @ApiProperty({ description: 'Name of the MODULE_NAME' })
  @IsString()
  @IsNotEmpty()
  name: string;

  // Reference ID — always @IsString(), NOT @IsMongoId()
  // @ApiPropertyOptional() @IsOptional() @IsString() relatedEntityId?: string;

  // Array of strings
  // @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];

  // Enum field
  // @ApiPropertyOptional({ enum: ['option1', 'option2'] }) @IsOptional() @IsEnum(['option1', 'option2']) type?: string;

  // Nested object
  // @ApiPropertyOptional({ type: MODULE_CLASSAddressDto })
  // @IsOptional() @IsObject() @ValidateNested() @Type(() => MODULE_CLASSAddressDto)
  // address?: MODULE_CLASSAddressDto;

  // Monetary amount
  // @ApiPropertyOptional({ type: MoneyAmountDto })
  // @IsOptional() @IsObject() @ValidateNested() @Type(() => MoneyAmountDto)
  // amount?: MoneyAmountDto;

  // Optional free-text notes
  // @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// Update DTO — always PartialType of Create (all fields become optional)
export class UpdateMODULE_CLASSDto extends PartialType(CreateMODULE_CLASSDto) {}

// TODO: Add action-specific DTOs here if module has state machine
// export class RejectMODULE_CLASSDto {
//   @ApiProperty({ description: 'Reason for rejection' })
//   @IsString() @IsNotEmpty()
//   rejectionReason: string;
// }
