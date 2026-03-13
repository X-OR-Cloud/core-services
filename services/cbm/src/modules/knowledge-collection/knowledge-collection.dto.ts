import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  IsNumber,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ChunkingConfigDto {
  @ApiPropertyOptional({
    enum: ['fixed', 'sentence', 'paragraph'],
    default: 'sentence',
    description: 'Chunking strategy',
  })
  @IsOptional()
  @IsEnum(['fixed', 'sentence', 'paragraph'])
  strategy?: 'fixed' | 'sentence' | 'paragraph';

  @ApiPropertyOptional({ description: 'Chunk size in tokens', default: 512, minimum: 64 })
  @IsOptional()
  @IsNumber()
  @Min(64)
  chunkSize?: number;

  @ApiPropertyOptional({ description: 'Chunk overlap in tokens', default: 64, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  chunkOverlap?: number;
}

export class CreateKnowledgeCollectionDto {
  @ApiProperty({ description: 'Collection name', example: 'Quy định nội bộ', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'Description to help Agent understand when to use this collection', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ description: 'Optional project ID this collection belongs to' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Custom chunking configuration (uses env defaults if not set)', type: ChunkingConfigDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ChunkingConfigDto)
  chunkingConfig?: ChunkingConfigDto;

  @ApiPropertyOptional({ description: 'Embedding model override (uses KB_EMBEDDING_MODEL env default if not set)' })
  @IsOptional()
  @IsString()
  embeddingModel?: string;
}

export class UpdateKnowledgeCollectionDto {
  @ApiPropertyOptional({ description: 'Collection name', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Collection description', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ description: 'Custom chunking configuration', type: ChunkingConfigDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ChunkingConfigDto)
  chunkingConfig?: ChunkingConfigDto;
}

export class SearchKnowledgeCollectionDto {
  @ApiProperty({ description: 'Search query text', example: 'chính sách nghỉ phép' })
  @IsString()
  query!: string;

  @ApiPropertyOptional({ description: 'Number of top results to return', default: 5, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  topK?: number = 5;
}
