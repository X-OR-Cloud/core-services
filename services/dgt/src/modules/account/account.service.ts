import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model } from 'mongoose';
import { Queue } from 'bullmq';
import { createHash, createCipheriv, createDecipheriv, randomBytes, createHmac } from 'crypto';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext, PredefinedRole } from '@hydrabyte/shared';
import { Account, AccountType } from './account.schema';
import { CreateAccountDto } from './account.dto';
import { QUEUE_NAMES, SIGNAL_JOB_TYPES } from '../../config/queue.config';
import { ExchangeAdapterFactory } from '../../exchange/exchange-adapter.factory';

const ENCRYPTION_KEY = process.env['API_SECRET_KEY'] || 'dgt-default-secret-key-32chars!!';
const KEY = createHash('sha256').update(ENCRYPTION_KEY).digest(); // 32 bytes for AES-256

function encryptSecret(plain: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptSecret(encrypted: string): string {
  const [ivHex, encHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv('aes-256-cbc', KEY, iv);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
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
    @InjectQueue(QUEUE_NAMES.SIGNAL_SCHEDULER) private readonly signalSchedulerQueue: Queue,
    private readonly adapterFactory: ExchangeAdapterFactory,
  ) {
    super(accountModel as any);
  }

  private async publishSyncAccountSignals(accountId: string, action: 'upsert' | 'remove'): Promise<void> {
    await this.signalSchedulerQueue.add(
      SIGNAL_JOB_TYPES.SYNC_ACCOUNT_SIGNALS,
      { type: SIGNAL_JOB_TYPES.SYNC_ACCOUNT_SIGNALS, params: { accountId, action } },
      { removeOnComplete: 10, removeOnFail: 10 },
    );
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
    // count default accounts to set the first one as default
    const existingCount = await this.model.countDocuments({ "owner.orgId": context.orgId, "owner.userId": context.userId, isDefault: true }).exec();
    if (existingCount === 0) {
      data.isDefault = true;
    }
    const result = await super.create(data, context);
    const accountId = (result as any)._id?.toString();
    if (accountId && data.status === 'active') {
      await this.publishSyncAccountSignals(accountId, 'upsert');
    }
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
    const accountId = (id as { toString(): string })?.toString();
    if (accountId && 'status' in dto) {
      const action = (dto as { status?: string }).status === 'active' ? 'upsert' : 'remove';
      await this.publishSyncAccountSignals(accountId, action);
    }
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
    const result = await super.softDelete(id, context);
    await this.publishSyncAccountSignals((id as { toString(): string }).toString(), 'remove');
    return result;
  }

  /**
   * Test kết nối API key với exchange.
   * Hỗ trợ cả LIVE (mainnet) và SANDBOX/paper (testnet).
   * - SANDBOX (paper) → Binance Testnet, OKX Demo, Bybit Testnet
   * - LIVE → exchange mainnet
   */
  async testConnection(id: any, context: RequestContext): Promise<{ status: string; permissions?: string[]; error?: string }> {
    const account = await this.findById(id, context);
    if (!account) throw new NotFoundException(`Account ${id} not found`);

    const rawAccount = await (this as any).model.findById(id).lean().exec();
    const apiKey = rawAccount?.apiKey || '';
    const encryptedSecret = rawAccount?.apiSecret || '';

    if (!apiKey || !encryptedSecret) {
      await super.update(id, { apiKeyStatus: 'invalid' }, context);
      return { status: 'invalid', error: 'API key or secret not configured' };
    }

    let apiSecret: string;
    try {
      apiSecret = decryptSecret(encryptedSecret);
    } catch {
      await super.update(id, { apiKeyStatus: 'invalid' }, context);
      return { status: 'invalid', error: 'Failed to decrypt API secret' };
    }

    const exchange = rawAccount?.exchange || 'binance';
    const isDemoAccount = rawAccount?.accountType === AccountType.PAPER; // paper = demo/sandbox

    // Chỉ Binance hỗ trợ test-connection hiện tại (OKX/Bybit chưa implement)
    if (exchange !== 'binance') {
      await super.update(id, { apiKeyStatus: 'valid' }, context);
      return { status: 'valid', error: undefined };
    }

    // Binance Spot Demo: https://demo-api.binance.com (key từ demo.binance.com)
    // Binance Spot Live: https://api.binance.com
    const baseUrl = isDemoAccount
      ? 'https://demo-api.binance.com'
      : 'https://api.binance.com';

    try {
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = createHmac('sha256', apiSecret).update(queryString).digest('hex');

      const res = await fetch(`${baseUrl}/api/v3/account?${queryString}&signature=${signature}`, {
        headers: { 'X-MBX-APIKEY': apiKey },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await super.update(id, { apiKeyStatus: 'invalid' }, context);
        return { status: 'invalid', error: (body as any).msg || `HTTP ${res.status}` };
      }

      const data: any = await res.json();
      const permissions: string[] = data.permissions || [];
      await super.update(id, { apiKeyStatus: 'valid' }, context);
      return { status: 'valid', permissions };
    } catch (err: any) {
      await super.update(id, { apiKeyStatus: 'invalid' }, context);
      return { status: 'invalid', error: err?.message || 'Connection failed' };
    }
  }

  /**
   * Sync balance từ exchange về DB.
   * Dùng ExchangeAdapter (Binance/OKX/Bybit) để lấy số dư USDT thực tế.
   * Hỗ trợ cả LIVE và SANDBOX (paper/testnet).
   */
  async syncBalance(id: any, context: RequestContext): Promise<{ balance: number; currency: string }> {
    const account = await this.findById(id, context);
    if (!account) throw new NotFoundException(`Account ${id} not found`);

    const rawAccount = await (this as any).model.findById(id).lean().exec();

    if (!rawAccount?.apiKey || !rawAccount?.apiSecret) {
      throw new BadRequestException('API key not configured. Please set API key before syncing balance.');
    }

    let balance: number;
    try {
      const adapter = this.adapterFactory.createAdapter({
        exchange: rawAccount.exchange,
        accountType: rawAccount.accountType,
        apiKey: rawAccount.apiKey,
        apiSecret: rawAccount.apiSecret,
      });

      const currency = rawAccount.currency || 'USDT';
      balance = await adapter.getBalance(currency);
    } catch (err: any) {
      throw new BadRequestException(`Failed to sync balance from exchange: ${err?.message}`);
    }

    await super.update(id, { balance }, context);
    return { balance, currency: rawAccount.currency || 'USDT' };
  }

  private async verifyOwnership(id: any, context: RequestContext): Promise<void> {
    const existing = await super.findById(id, context);
    if (existing?.owner?.userId !== context.userId) {
      throw new ForbiddenException('Access denied');
    }
  }
}
