import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';

// ─── Generate Key Pair ────────────────────────────────────────────────────────

export class GenerateKeyPairResponseDto {
  @ApiProperty({ description: 'Suggested key ID to use as JWT kid header', example: 'key-1743160800000' })
  suggestedKeyId: string;

  @ApiProperty({ description: 'EC public key in PEM format (SPKI). Upload this to AIWM Portal → Agent → Public Keys.', example: '-----BEGIN PUBLIC KEY-----\nMFkw...\n-----END PUBLIC KEY-----' })
  publicKey: string;

  @ApiProperty({ description: 'EC private key in PEM format (PKCS8). Keep secret — use this to sign tokens on your server.', example: '-----BEGIN PRIVATE KEY-----\nMIGH...\n-----END PRIVATE KEY-----' })
  privateKey: string;

  @ApiProperty({ description: 'Example Node.js code to sign an anonymous chat token using this key pair' })
  exampleCode: string;

  @ApiProperty({ description: 'Warning: this key pair is for reference only, do not use in production', example: 'This key pair is ephemeral and generated for demonstration only. Generate your own key pair and keep the private key secret.' })
  disclaimer: string;
}

// ─── Sign Token ───────────────────────────────────────────────────────────────

export class SignTokenDto {
  @ApiProperty({ description: 'EC private key in PEM format (PKCS8)', example: '-----BEGIN PRIVATE KEY-----\nMIGH...\n-----END PRIVATE KEY-----' })
  @IsString()
  @IsNotEmpty()
  privateKey: string;

  @ApiProperty({ description: 'Agent ID on AIWM', example: '69b219445f803203cf8ab6f3' })
  @IsString()
  @IsNotEmpty()
  agentId: string;

  @ApiProperty({ description: 'Key ID — must match the keyId uploaded to AIWM Portal (used as JWT kid header)', example: 'prod-key-001' })
  @IsString()
  @IsNotEmpty()
  kid: string;

  @ApiPropertyOptional({ description: 'Anonymous user UUID. Auto-generated if not provided.', example: 'fe20f674-6ba4-4030-914d-dbb69abfe50c' })
  @IsOptional()
  @IsString()
  anonymousId?: string;

  @ApiPropertyOptional({ description: 'Token lifetime in seconds. Default: 86400 (24h).', example: 86400 })
  @IsOptional()
  @IsNumber()
  @Min(60)
  expiresIn?: number;
}

export class SignTokenResponseDto {
  @ApiProperty({ description: 'Signed JWT token to pass into StackAIChat.init({ token })' })
  token: string;

  @ApiProperty({ description: 'Decoded JWT header' })
  header: Record<string, any>;

  @ApiProperty({ description: 'Decoded JWT payload' })
  payload: Record<string, any>;

  @ApiProperty({ description: 'Token expiry (ISO 8601)', example: '2026-03-31T10:00:00.000Z' })
  expiresAt: string;
}

// ─── Verify Token ─────────────────────────────────────────────────────────────

export class VerifyTokenDto {
  @ApiProperty({ description: 'JWT token to verify', example: 'eyJ0eXAiOiJKV1Qi...' })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class VerifyTokenResponseDto {
  @ApiProperty({ description: 'Whether the token passed all checks', example: true })
  valid: boolean;

  @ApiProperty({ description: 'Decoded JWT header' })
  header: Record<string, any>;

  @ApiProperty({ description: 'Decoded JWT payload' })
  payload: Record<string, any>;

  @ApiProperty({ description: 'Token expiry (ISO 8601)', example: '2026-03-31T10:00:00.000Z' })
  expiresAt: string;

  @ApiProperty({ description: 'Whether token is expired', example: false })
  expired: boolean;

  @ApiProperty({ description: 'Matched signing key info (null if no matching key found)' })
  matchedKey: {
    keyId: string;
    algorithm: string;
    label?: string;
    createdAt: Date;
  } | null;

  @ApiPropertyOptional({ description: 'Error message if valid=false' })
  error?: string;
}
