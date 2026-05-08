import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength, IsArray, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PermissionDto } from './permission.dto';

export class CreateServiceAccountDto {
  @ApiProperty({ example: 'integration-service', description: 'Service account name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiProperty({ example: 'Service account for CBM integration', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim())
  description?: string;

  @ApiProperty({
    type: [PermissionDto],
    example: [{ service: 'cbm', resource: 'payment', action: '*' }],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionDto)
  permissions: PermissionDto[];
}
