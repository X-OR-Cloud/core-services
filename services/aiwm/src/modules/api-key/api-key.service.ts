import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { RequestContext } from '@hydrabyte/shared';
import { ApiKey, ApiKeyDocument } from './api-key.schema';
import { CreateApiKeyDto, CreateApiKeyResponseDto, ApiKeyResponseDto } from './api-key.dto';

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectModel(ApiKey.name) private readonly apiKeyModel: Model<ApiKeyDocument>,
  ) {}

  // ─── Key Generation ────────────────────────────────────────────────────────

  private generateKey(): { fullKey: string; keyPrefix: string; keyHash: string } {
    const prefix = crypto.randomBytes(4).toString('hex'); // 8 hex chars
    const secret = crypto.randomBytes(24).toString('base64url'); // 32 url-safe chars
    const fullKey = `xai_${prefix}.${secret}`;
    const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');
    return { fullKey, keyPrefix: prefix, keyHash };
  }

  private hashKey(fullKey: string): string {
    return crypto.createHash('sha256').update(fullKey).digest('hex');
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async create(
    dto: CreateApiKeyDto,
    context: RequestContext,
  ): Promise<CreateApiKeyResponseDto> {
    const { fullKey, keyPrefix, keyHash } = this.generateKey();

    const created = await this.apiKeyModel.create({
      name: dto.name,
      keyHash,
      keyPrefix,
      scopes: dto.scopes ?? ['all'],
      status: 'active',
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      owner: {
        orgId: context.orgId,
        groupId: context.groupId || '',
        userId: context.userId,
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
      createdBy: context,
      updatedBy: context,
    });

    return {
      _id: (created._id as any).toString(),
      name: created.name,
      keyPrefix: created.keyPrefix,
      scopes: created.scopes,
      status: created.status,
      expiresAt: created.expiresAt ?? null,
      key: fullKey, // Plain text — returned once only
    };
  }

  async findAll(context: RequestContext): Promise<ApiKeyResponseDto[]> {
    const keys = await this.apiKeyModel
      .find({ 'owner.orgId': context.orgId, isDeleted: false })
      .select('-keyHash -isDeleted -updatedBy -createdBy')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return keys.map((k) => ({
      _id: (k._id as any).toString(),
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes,
      status: k.status,
      lastUsedAt: k.lastUsedAt ?? null,
      expiresAt: k.expiresAt ?? null,
      createdAt: k.createdAt,
    }));
  }

  async revoke(id: string, context: RequestContext): Promise<{ message: string }> {
    const key = await this.apiKeyModel
      .findOne({ _id: id, 'owner.orgId': context.orgId, isDeleted: false })
      .exec();

    if (!key) {
      throw new NotFoundException(`API key not found`);
    }

    key.status = 'revoked';
    (key as any).updatedBy = context;
    await key.save();

    return { message: 'API key revoked successfully' };
  }

  // ─── Validation (used by CombinedAuthGuard) ────────────────────────────────

  /**
   * Validate an API key string and return RequestContext if valid.
   * Also checks scope against the target deploymentId (if provided).
   */
  async validateKey(
    rawKey: string,
    deploymentId?: string,
  ): Promise<RequestContext> {
    const keyHash = this.hashKey(rawKey);

    const apiKey = await this.apiKeyModel
      .findOne({ keyHash, status: 'active', isDeleted: false })
      .lean()
      .exec();

    if (!apiKey) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    // Check expiry
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      throw new UnauthorizedException('API key has expired');
    }

    // Check scope
    const hasAllScope = apiKey.scopes.includes('all');
    const hasDeploymentScope =
      deploymentId && apiKey.scopes.includes(`deployment:${deploymentId}`);

    if (!hasAllScope && !hasDeploymentScope) {
      throw new ForbiddenException(
        `API key does not have permission for this resource`,
      );
    }

    // Update lastUsedAt async (non-blocking)
    this.apiKeyModel
      .updateOne({ _id: apiKey._id }, { lastUsedAt: new Date() })
      .exec()
      .catch(() => {});

    // Build RequestContext from key metadata
    return {
      userId: apiKey.owner?.userId || '',
      orgId: apiKey.owner?.orgId || '',
      groupId: apiKey.owner?.groupId || '',
      agentId: '',
      appId: '',
      roles: ['organization.owner' as any],
    };
  }
}
