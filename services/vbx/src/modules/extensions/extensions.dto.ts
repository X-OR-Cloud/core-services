import { IsString, IsEnum, IsOptional, IsArray, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateExtensionDto {
  @ApiProperty({ description: 'Extension number', example: '1001' })
  @IsString()
  number: string;

  @ApiProperty({ description: 'Extension name', example: 'AI Receptionist' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: ['ai', 'sip'], default: 'ai' })
  @IsOptional()
  @IsEnum(['ai', 'sip'])
  type?: string;

  @ApiPropertyOptional({ description: 'AI configuration object' })
  @IsOptional()
  @IsObject()
  ai?: {
    provider?: string;
    model?: string;
    voice?: string;
    systemPrompt?: string;
    temperature?: number;
    maxCallDurationSec?: number;
    vad?: {
      threshold?: number;
      silenceDurationMs?: number;
      prefixPaddingMs?: number;
    };
  };

  @ApiPropertyOptional({ description: 'Allowed caller numbers (glob patterns)', type: [String] })
  @IsOptional()
  @IsArray()
  allowedCallers?: string[];

  @ApiPropertyOptional({ description: 'Initial message for AI greeting' })
  @IsOptional()
  @IsString()
  initialMessage?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'], default: 'active' })
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class UpdateExtensionDto extends PartialType(CreateExtensionDto) {}
