import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class SetupServiceUrlsDto {
  @ApiProperty({ example: 'http://localhost:3001' })
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  iamBaseApiUrl: string;

  @ApiProperty({ example: 'http://localhost:3003' })
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  aiwmBaseApiUrl: string;

  @ApiProperty({ example: 'http://localhost:3355' })
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  aiwmBaseMcpUrl: string;

  @ApiProperty({ example: 'ws://localhost:3003' })
  @IsString()
  @IsNotEmpty()
  aiwmBaseWsUrl: string;

  @ApiProperty({ example: 'http://localhost:3004' })
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  cbmBaseApiUrl: string;

  @ApiProperty({ example: 'http://localhost:3005' })
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  monaBaseApiUrl: string;
}

export class SetupInitializeDto {
  @ApiProperty({ description: 'Organization ID from IAM setup' })
  @IsString()
  @IsNotEmpty()
  orgId: string;

  @ApiProperty({ description: 'Admin user ID from IAM setup' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ type: SetupServiceUrlsDto })
  serviceUrls: SetupServiceUrlsDto;
}

export class SetupStatusResponse {
  @ApiProperty()
  initialized: boolean;

  @ApiProperty({ required: false })
  orgId?: string;
}

export class SetupInitializeResponse {
  @ApiProperty()
  orgId: string;

  @ApiProperty()
  total: number;

  @ApiProperty()
  created: number;

  @ApiProperty()
  skipped: number;
}
