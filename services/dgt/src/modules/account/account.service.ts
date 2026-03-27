import { Injectable, ForbiddenException, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model } from 'mongoose';
import { Queue } from 'bullmq';
import { createHash, createCipheriv, createDecipheriv, randomBytes, createHmac } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type Redis from 'ioredis';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext, PredefinedRole } from '@hydrabyte/shared';
import { Account, AccountType } from './account.schema';
import { CreateAccountDto, TestApiKeyDto } from './account.dto';
import { QUEUE_NAMES, SIGNAL_JOB_TYPES } from '../../config/queue.config';
import { ExchangeAdapterFactory } from '../../exchange/exchange-adapter.factory';
import { DGT_REDIS_CLIENT } from '../../shared/redis.provider';

// Redis key prefixes cho test-key flow
const TEST_KEY_DATA_PREFIX = 'dgt:test-key:data:';   // TTL 10 phút — chứa apiKey/apiSecret
const TEST_KEY_META_PREFIX = 'dgt:test-key:meta:';   // TTL 30 phút — tombstone để detect expired
const TEST_KEY_DATA_TTL = 600;   // 10 phút (giây)
const TEST_KEY_META_TTL = 1800;  // 30 phút (giây)

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
    @Inject(DGT_REDIS_CLIENT) private readonly redis: Redis,
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

  /**
   * Test API key với exchange TRƯỚC khi tạo account.
   * Nếu test thành công: lưu vào Redis (TTL 10 phút) và trả về testToken.
   * FE dùng testToken này trong POST /accounts thay vì gửi lại apiKey/apiSecret.
   */
  async testKeyBeforeCreate(
    dto: TestApiKeyDto,
    userId: string,
  ): Promise<{ testToken: string; expiresIn: number; status: string; permissions?: string[]; balance?: number; currency?: string }> {
    const { apiKey, apiSecret, exchange, accountType, currency = 'USDT' } = dto;

    // Test connection với exchange
    const isDemoAccount = accountType === AccountType.PAPER;
    let permissions: string[] = [];
    let balance: number | undefined;

    if (exchange === 'binance') {
      const baseUrl = isDemoAccount ? 'https://demo-api.binance.com' : 'https://api.binance.com';
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = createHmac('sha256', apiSecret).update(queryString).digest('hex');

      const res = await fetch(`${baseUrl}/api/v3/account?${queryString}&signature=${signature}`, {
        headers: { 'X-MBX-APIKEY': apiKey },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new BadRequestException((body as any).msg || `Exchange returned HTTP ${res.status}`);
      }

      const data: any = await res.json();
      permissions = data.permissions || [];

      // Lấy balance luôn nếu test thành công
      try {
        const adapter = this.adapterFactory.createAdapter({ exchange, accountType, apiKey, apiSecret });
        balance = await adapter.getBalance(currency);
      } catch {
        // Non-blocking — không fail nếu getBalance lỗi
      }
    }
    // OKX / Bybit: chấp nhận key mà không test thật (chưa implement adapter test)
    // Sẽ mở rộng sau khi có adapter đầy đủ

    // Lưu vào Redis
    const testToken = uuidv4();
    const payload = JSON.stringify({ apiKey, apiSecret: encryptSecret(apiSecret), exchange, accountType, currency, userId });

    await this.redis.set(`${TEST_KEY_DATA_PREFIX}${testToken}`, payload, 'EX', TEST_KEY_DATA_TTL);
    await this.redis.set(`${TEST_KEY_META_PREFIX}${testToken}`, '1', 'EX', TEST_KEY_META_TTL);

    return {
      testToken,
      expiresIn: TEST_KEY_DATA_TTL,
      status: 'valid',
      permissions,
      ...(balance !== undefined && { balance, currency }),
    };
  }

  /**
   * Resolve testToken từ Redis thành { apiKey, apiSecret, exchange, accountType }.
   * Phân biệt rõ 2 trường hợp lỗi: token hết hạn vs token không hợp lệ.
   */
  private async resolveTestToken(
    testToken: string,
    userId: string,
  ): Promise<{ apiKey: string; apiSecret: string; exchange: string; accountType: string; currency: string }> {
    const dataRaw = await this.redis.get(`${TEST_KEY_DATA_PREFIX}${testToken}`);

    if (dataRaw) {
      // Token còn hạn — parse và verify ownership
      const data = JSON.parse(dataRaw);
      if (data.userId !== userId) {
        throw new BadRequestException('Token không hợp lệ');
      }
      // One-time use: xóa cả 2 keys ngay
      await this.redis.del(`${TEST_KEY_DATA_PREFIX}${testToken}`);
      await this.redis.del(`${TEST_KEY_META_PREFIX}${testToken}`);
      return {
        apiKey: data.apiKey,
        apiSecret: decryptSecret(data.apiSecret), // decrypt để dùng, rồi re-encrypt khi save
        exchange: data.exchange,
        accountType: data.accountType,
        currency: data.currency || 'USDT',
      };
    }

    // Data key hết hạn — check tombstone để phân biệt expired vs invalid
    const meta = await this.redis.get(`${TEST_KEY_META_PREFIX}${testToken}`);
    if (meta) {
      throw new BadRequestException('Test token đã hết hạn, vui lòng thực hiện test kết nối lại');
    }

    throw new BadRequestException('Token không hợp lệ');
  }

  private isOrgOwner(context: RequestContext): boolean {
    return (
      context.roles?.includes(PredefinedRole.OrganizationOwner) ||
      context.roles?.includes(PredefinedRole.UniverseOwner)
    );
  }

  async create(dto: CreateAccountDto | any, context: RequestContext): Promise<Partial<Account>> {
    const { testToken, ...rest } = dto;
    const data: any = { ...rest, balance: dto.initialBalance || 0 };

    if (testToken) {
      // Luồng chính (qua API): lấy apiKey/apiSecret đã verify từ Redis
      // Ưu tiên tất cả thông tin từ token — bỏ qua bất kỳ giá trị nào FE truyền trực tiếp
      const resolved = await this.resolveTestToken(testToken, context.userId);
      data.apiKey = resolved.apiKey;
      data.apiSecret = encryptSecret(resolved.apiSecret);
      data.exchange = resolved.exchange;
      data.accountType = resolved.accountType;
      data.currency = resolved.currency;
      data.apiKeyStatus = 'valid';
    }
    // Luồng không có testToken: chỉ dành cho internal system calls (VD: iam-event.processor)
    // Controller đã validate testToken bắt buộc cho external API requests

    // Set isDefault nếu chưa có account nào
    const existingCount = await this.model.countDocuments({
      'owner.orgId': context.orgId,
      'owner.userId': context.userId,
      isDefault: true,
    }).exec();
    if (existingCount === 0) {
      data.isDefault = true;
    }

    // Account là self-service resource — bypass BaseService.create() để tránh RBAC check
    // (organization.viewer cũng có quyền tạo account của chính mình)
    const auditCtx = { ...context };
    delete (auditCtx as any).licenses;
    const dataWithOwner = {
      ...data,
      owner: {
        orgId: context.orgId || '',
        groupId: context.groupId || '',
        userId: context.userId || '',
        agentId: context.agentId || '',
        appId: context.appId || '',
      },
      createdBy: auditCtx,
      updatedBy: auditCtx,
    };
    const created = new this.model(dataWithOwner);
    const saved = await created.save();
    const result = saved.toObject ? saved.toObject() : (saved as any);
    delete (result as any).isDeleted;
    delete (result as any).deletedAt;

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

      // Auto-sync balance sau khi test key thành công
      this.syncBalance(id, context).catch((err) => {
        // Non-blocking: không fail testConnection nếu sync lỗi
        const logger = (this as any).logger;
        if (logger) logger.warn(`[Account] Auto-sync balance failed after testConnection: ${err?.message}`);
      });

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
