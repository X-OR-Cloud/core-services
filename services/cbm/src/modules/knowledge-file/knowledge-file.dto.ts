import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UploadKnowledgeFileDto {
  @ApiProperty({ description: 'KnowledgeCollection ID this file belongs to' })
  @IsString()
  collectionId!: string;

  @ApiPropertyOptional({ description: 'Display name (defaults to original filename if not set)' })
  @IsOptional()
  @IsString()
  name?: string;
}
