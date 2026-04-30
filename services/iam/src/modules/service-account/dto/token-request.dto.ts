import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class TokenRequestDto {
  @ApiProperty({ description: 'Service account ID (_id of the record)', example: '6643a1b2c3d4e5f6a7b8c9d0' })
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @ApiProperty({ description: 'Raw secret (returned once at creation)' })
  @IsString()
  @IsNotEmpty()
  secret: string;
}
