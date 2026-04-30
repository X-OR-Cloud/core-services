import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class PermissionDto {
  @ApiProperty({ example: 'cbm', description: "Service name. Use '*' for all." })
  @IsString()
  @IsNotEmpty()
  service: string;

  @ApiProperty({ example: 'payment', description: "Resource name. Use '*' for all." })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({ example: 'createOne', description: "Action name. Use '*' for all." })
  @IsString()
  @IsNotEmpty()
  action: string;
}
