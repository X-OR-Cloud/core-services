import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
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
    if (dto.apiSecret) {
      dto.apiSecret = encryptSecret(dto.apiSecret);
    }
    const result = await super.update(id, dto, context);
    return sanitizeAccount(result);
  }

  async findById(id: any, context: RequestContext): Promise<Partial<Account>> {
    const result = await super.findById(id, context);
    return sanitizeAccount(result);
  }

  async findAll(options: any, context: RequestContext): Promise<any> {
    const result = await super.findAll(options, context);
    return {
      ...result,
      data: result.data.map(sanitizeAccount),
    };
  }
}
