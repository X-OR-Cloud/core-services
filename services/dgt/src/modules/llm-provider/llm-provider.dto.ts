import { IsString, IsEnum, IsNumber, IsOptional, IsUrl, Min, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { LlmProviderSchema, LlmProviderStatus } from './llm-provider.schema';

export class DefaultParamsDto {
  @ApiPropertyOptional({ example: 0.2 })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({ example: 8192 })
  @IsOptional()
  @IsNumber()
  max_tokens?: number;

  @ApiPropertyOptional({ example: 1.0 })
  @IsOptional()
  @IsNumber()
  top_p?: number;
}

export class CreateLlmProviderDto {
  @ApiProperty({ example: 'Nebius Qwen3-32B' })
  @IsString()
  name: string;

  @ApiProperty({ enum: LlmProviderSchema })
  @IsEnum(LlmProviderSchema)
  schema: LlmProviderSchema;

  @ApiProperty({ example: 'https://xproxy.x-or.cloud/v1' })
  @IsString()
  baseUrl: string;

  @ApiProperty({ example: 'sk-xxxxxxxxxxxx' })
  @IsString()
  apiKeyValue: string;

  @ApiProperty({ example: 'nebius/qwen3-32b' })
  @IsString()
  model: string;

  @ApiPropertyOptional({ minimum: 1, example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DefaultParamsDto)
  defaultParams?: DefaultParamsDto;
}

export class UpdateLlmProviderDto extends PartialType(CreateLlmProviderDto) {}

export class UpdateStatusDto {
  @ApiProperty({ enum: [LlmProviderStatus.ACTIVE, LlmProviderStatus.INACTIVE] })
  @IsEnum([LlmProviderStatus.ACTIVE, LlmProviderStatus.INACTIVE])
  status: LlmProviderStatus.ACTIVE | LlmProviderStatus.INACTIVE;
}
