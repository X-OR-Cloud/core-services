import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';

export class UploadFileDto {
  @ApiProperty({
    enum: ['knowledge', 'attachment', 'avatar', 'cover', 'other'],
    description: 'File purpose',
  })
  @IsEnum(['knowledge', 'attachment', 'avatar', 'cover', 'other'])
  purpose!: 'knowledge' | 'attachment' | 'avatar' | 'cover' | 'other';

  @ApiPropertyOptional({
    enum: ['knowledge-collection', 'document', 'work', 'project', 'user', 'organization'],
    description: 'Owner reference kind',
  })
  @IsOptional()
  @IsEnum(['knowledge-collection', 'document', 'work', 'project', 'user', 'organization'])
  ownerKind?: 'knowledge-collection' | 'document' | 'work' | 'project' | 'user' | 'organization';

  @ApiPropertyOptional({ description: 'Owner reference ID (required when ownerKind is set)' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ description: 'Display name (defaults to original filename)' })
  @IsOptional()
  @IsString()
  name?: string;
}
