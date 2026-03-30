import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { Agent, AgentDocument } from '../agent/agent.schema';
import {
  GenerateKeyPairResponseDto,
  SignTokenDto,
  SignTokenResponseDto,
  VerifyTokenDto,
  VerifyTokenResponseDto,
} from './debug.dto';

@Injectable()
export class DebugService {
  constructor(
    @InjectModel(Agent.name) private agentModel: Model<AgentDocument>,
  ) {}

  /**
   * Generate an ephemeral ES256 key pair with example code.
   * Keys are not persisted. For demonstration only.
   */
  generateKeyPair(): GenerateKeyPairResponseDto {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      publicKeyEncoding:  { type: 'spki',  format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const suggestedKeyId = `key-${Date.now()}`;

    const exampleCode = `const jwt = require('jsonwebtoken')
const fs  = require('fs')
const { v4: uuidv4 } = require('uuid')

const privateKey = fs.readFileSync('./private.pem')

function generateChatToken(agentId, userId) {
  return jwt.sign(
    {
      type:        'anonymous',
      agentId:     agentId,
      anonymousId: userId || uuidv4(),
    },
    privateKey,
    {
      algorithm: 'ES256',
      expiresIn: '24h',
      header:    { alg: 'ES256', kid: '${suggestedKeyId}' },
    }
  )
}

// Usage
const token = generateChatToken('<agentId>', '<userId>')

// Init SDK
// StackAIChat.init({ wsUrl: 'wss://skt.x-or.cloud/ws/chat', token })`;

    return {
      suggestedKeyId,
      publicKey,
      privateKey,
      exampleCode,
      disclaimer: 'This key pair is ephemeral and generated for demonstration only. Do NOT use these keys in production. Generate your own key pair locally and keep the private key secret on your server.',
    };
  }

  /**
   * Sign an anonymous chat token using the provided private key.
   */
  signToken(dto: SignTokenDto): SignTokenResponseDto {
    const expiresIn = dto.expiresIn ?? 86400;
    const anonymousId = dto.anonymousId ?? crypto.randomUUID();
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + expiresIn;

    let privateKey: crypto.KeyObject;
    try {
      privateKey = crypto.createPrivateKey({ key: dto.privateKey, format: 'pem' });
    } catch {
      throw new BadRequestException('Invalid private key: must be a valid EC private key in PEM format');
    }

    const details = privateKey.asymmetricKeyDetails;
    if (privateKey.asymmetricKeyType !== 'ec' || details?.namedCurve !== 'prime256v1') {
      throw new BadRequestException('Private key must be EC P-256 (prime256v1) for ES256');
    }

    const header  = { typ: 'JWT', alg: 'ES256', kid: dto.kid };
    const payload = { type: 'anonymous', agentId: dto.agentId, anonymousId, iat, exp };

    const headerB64  = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signingInput = `${headerB64}.${payloadB64}`;

    const sign = crypto.createSign('SHA256');
    sign.update(signingInput);
    const signature = sign.sign(privateKey, 'base64url');

    return {
      token: `${signingInput}.${signature}`,
      header,
      payload: { ...payload, iat_human: new Date(iat * 1000).toISOString(), exp_human: new Date(exp * 1000).toISOString() },
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  /**
   * Verify a partner-signed token against the agent's registered public keys.
   */
  async verifyToken(agentId: string, dto: VerifyTokenDto): Promise<VerifyTokenResponseDto> {
    const parts = dto.token.split('.');
    if (parts.length !== 3) {
      return this._failResult(dto.token, 'Invalid JWT format (expected 3 parts)');
    }

    // Decode header & payload
    let header: any, payload: any;
    try {
      header  = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
      return this._failResult(dto.token, 'Failed to decode token header or payload');
    }

    // Check algorithm
    if (header.alg !== 'ES256') {
      return this._failResult(dto.token, `Unsupported algorithm: ${header.alg}. Expected ES256.`, header, payload);
    }

    // Check expiry
    const nowSec = Math.floor(Date.now() / 1000);
    const expired = payload.exp ? payload.exp < nowSec : false;

    // Load agent signing keys
    const agent = await this.agentModel
      .findOne({ _id: agentId, isDeleted: false })
      .select('+externalSigningKeys')
      .lean();

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    const now = new Date();
    const keys: any[] = (agent as any).externalSigningKeys ?? [];

    // Find candidate key by kid, fallback to all active keys
    const kid = header.kid;
    const candidates = kid ? keys.filter((k) => k.keyId === kid) : keys;
    const activeKey = candidates.find(
      (k) => !k.revokedAt && (!k.expiresAt || new Date(k.expiresAt) > now)
    );

    if (!activeKey) {
      const reason = kid
        ? `No active signing key found for kid="${kid}". Check the key is uploaded and not revoked.`
        : 'No active signing keys configured for this agent.';
      return this._failResult(dto.token, reason, header, payload, expired);
    }

    // Verify signature
    try {
      const pubKey = crypto.createPublicKey({ key: activeKey.publicKey, format: 'pem' });
      const verify = crypto.createVerify('SHA256');
      verify.update(`${parts[0]}.${parts[1]}`);
      const sig = Buffer.from(parts[2], 'base64url');
      // ES256 signatures from jsonwebtoken are DER-encoded (IEEE P1363 format)
      const signatureValid = verify.verify({ key: pubKey, dsaEncoding: 'ieee-p1363' }, sig);

      if (!signatureValid) {
        return {
          valid: false,
          header,
          payload,
          expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : '',
          expired,
          matchedKey: { keyId: activeKey.keyId, algorithm: activeKey.algorithm, label: activeKey.label, createdAt: activeKey.createdAt },
          error: `Signature invalid for key "${activeKey.keyId}". The token was not signed by the matching private key.`,
        };
      }
    } catch (e: any) {
      return this._failResult(dto.token, `Signature verification error: ${e.message}`, header, payload, expired);
    }

    return {
      valid: !expired,
      header,
      payload,
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : '',
      expired,
      matchedKey: { keyId: activeKey.keyId, algorithm: activeKey.algorithm, label: activeKey.label, createdAt: activeKey.createdAt },
      error: expired ? 'Token has expired' : undefined,
    };
  }

  private _failResult(
    _token: string,
    error: string,
    header: any = {},
    payload: any = {},
    expired = false,
  ): VerifyTokenResponseDto {
    return {
      valid: false,
      header,
      payload,
      expiresAt: payload?.exp ? new Date(payload.exp * 1000).toISOString() : '',
      expired,
      matchedKey: null,
      error,
    };
  }
}
