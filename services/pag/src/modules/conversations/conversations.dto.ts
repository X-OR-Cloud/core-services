import { IsString, IsEnum, IsArray, IsNumber, IsOptional, IsObject, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class ConversationPlatformUserDto {
  @ApiProperty({ description: 'Platform user ID', example: '1234567890' })
  @IsString()
  id: string;

  @ApiPropertyOptional({ description: 'Display name' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class CreateConversationDto {
  @ApiProperty({ description: 'Channel ID' })
  @IsString()
  channelId: string;

  @ApiProperty({ description: 'Soul ID' })
  @IsString()
  soulId: string;

  @ApiProperty({ description: 'Platform user information' })
  @IsObject()
  @ValidateNested()
  @Type(() => ConversationPlatformUserDto)
  platformUser: ConversationPlatformUserDto;

  @ApiProperty({ 
    description: 'Conversation status',
    enum: ['active', 'idle', 'closed'],
    default: 'active'
  })
  @IsEnum(['active', 'idle', 'closed'])
  status: string;

  @ApiPropertyOptional({ description: 'Last active timestamp' })
  @IsOptional()
  @IsDateString()
  lastActiveAt?: string;

  @ApiPropertyOptional({ description: 'Message count', default: 0 })
  @IsOptional()
  @IsNumber()
  messageCount?: number;

  @ApiPropertyOptional({ description: 'Conversation summary' })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ description: 'Summary last updated' })
  @IsOptional()
  @IsDateString()
  summaryUpdatedAt?: string;

  @ApiPropertyOptional({ description: 'Conversation tags' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateConversationDto extends PartialType(CreateConversationDto) {}

export class ConversationResponseDto extends CreateConversationDto {
  @ApiProperty({ description: 'Unique conversation ID' })
  _id: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

export class FindOrCreateConversationDto {
  @ApiProperty({ description: 'Channel ID' })
  @IsString()
  channelId: string;

  @ApiProperty({ description: 'Soul ID' })
  @IsString()
  soulId: string;

  @ApiProperty({ description: 'Platform user information' })
  @IsObject()
  @ValidateNested()
  @Type(() => ConversationPlatformUserDto)
  platformUser: ConversationPlatformUserDto;
}