import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext, PredefinedRole } from '@hydrabyte/shared';
import { Account } from './account.schema';
import { CreateAccountDto } from './account.dto';

const ENCRYPTION_KEY = process.env['API_SECRET_KEY'] || 'dgt-default-secret-key-32chars!!';
const KEY = createHash('sha256').update(ENCRYPTION_KEY).digest(); // 32 bytes for AES-256

function encryptSecret(plain: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return key;
  return 'xxxx...' + key.slice(-4);
}

function sanitizeAccount(account: any): any {
  if (!account) return account;
  const obj = account.toObject ? account.toObject() : { ...account };
  if (obj.apiKey) obj.apiKey = maskApiKey(obj.apiKey);
  delete obj.apiSecret;
  return obj;
}

@Injectable()
export class AccountService extends BaseService<Account> {
  constructor(
    @InjectModel(Account.name) accountModel: Model<Account>,
  ) {
    super(accountModel as any);
  }

  private isOrgOwner(context: RequestContext): boolean {
    return (
      context.roles?.includes(PredefinedRole.OrganizationOwner) ||
      context.roles?.includes(PredefinedRole.UniverseOwner)
    );
  }

  async create(dto: CreateAccountDto, context: RequestContext): Promise<Partial<Account>> {
    const data: any = {
      ...dto,
      balance: dto.initialBalance || 0,
    };
    if (data.apiSecret) {
      data.apiSecret = encryptSecret(data.apiSecret);
    }
    const result = await super.create(data, context);
    return sanitizeAccount(result);
  }

  async update(id: any, dto: any, context: RequestContext): Promise<Partial<Account>> {
    if (!this.isOrgOwner(context)) {
      await this.verifyOwnership(id, context);
    }
    if (dto.apiSecret) {
      dto.apiSecret = encryptSecret(dto.apiSecret);
    }
    const result = await super.update(id, dto, context);
    return sanitizeAccount(result);
  }

  async findById(id: any, context: RequestContext): Promise<Partial<Account>> {
    const result = await super.findById(id, context);
    if (!this.isOrgOwner(context) && result?.owner?.userId !== context.userId) {
      throw new ForbiddenException('Access denied');
    }
    return sanitizeAccount(result);
  }

  async findAll(options: FindManyOptions, context: RequestContext): Promise<FindManyResult<Account>> {
    if (!this.isOrgOwner(context)) {
      options.filter = { ...(options.filter || {}), 'owner.userId': context.userId };
    }
    const result = await super.findAll(options, context);
    return {
      ...result,
      data: result.data.map(sanitizeAccount),
    };
  }

  async softDelete(id: any, context: RequestContext): Promise<Partial<Account>> {
    if (!this.isOrgOwner(context)) {
      await this.verifyOwnership(id, context);
    }
    return super.softDelete(id, context);
  }

  private async verifyOwnership(id: any, context: RequestContext): Promise<void> {
    const existing = await super.findById(id, context);
    if (existing?.owner?.userId !== context.userId) {
      throw new ForbiddenException('Access denied');
    }
  }
}
