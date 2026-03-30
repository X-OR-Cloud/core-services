import { Controller, Post, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DebugService } from './debug.service';
import {
  GenerateKeyPairResponseDto,
  SignTokenDto,
  SignTokenResponseDto,
  VerifyTokenDto,
  VerifyTokenResponseDto,
} from './debug.dto';

@ApiTags('debug')
@Controller('debug')
export class DebugController {
  constructor(private readonly debugService: DebugService) {}

  @Post('ec-keypair/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate ephemeral ES256 key pair',
    description: [
      'Generates an ephemeral EC P-256 key pair for demonstration purposes.',
      'Returns the public key, private key, and example Node.js signing code.',
      '⚠️ Keys are NOT persisted. Do NOT use these keys in production.',
      'Generate your own key pair locally and keep the private key on your server.',
    ].join(' '),
  })
  @ApiResponse({ status: 200, description: 'Key pair generated', type: GenerateKeyPairResponseDto })
  generateKeyPair(): GenerateKeyPairResponseDto {
    return this.debugService.generateKeyPair();
  }

  @Post('ec-keypair/sign-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign an anonymous chat token',
    description: [
      'Signs an anonymous JWT token (ES256) using the provided private key.',
      'The kid must match a keyId registered in AIWM Portal for the target agent.',
      'Use the returned token in StackAIChat.init({ token }).',
    ].join(' '),
  })
  @ApiResponse({ status: 200, description: 'Token signed successfully', type: SignTokenResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid private key or parameters' })
  signToken(@Body() dto: SignTokenDto): SignTokenResponseDto {
    return this.debugService.signToken(dto);
  }

  @Post('agents/:id/signing-keys/verify-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify a partner-signed token against agent\'s registered keys',
    description: [
      'Decodes and verifies a JWT token against the public keys registered for the agent.',
      'Returns full debug info: matched key, signature validity, expiry status, decoded payload.',
      'Does NOT require authentication — intended for partner integration debugging.',
    ].join(' '),
  })
  @ApiResponse({ status: 200, description: 'Verification result (check valid field)', type: VerifyTokenResponseDto })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async verifyToken(
    @Param('id') agentId: string,
    @Body() dto: VerifyTokenDto,
  ): Promise<VerifyTokenResponseDto> {
    return this.debugService.verifyToken(agentId, dto);
  }
}
