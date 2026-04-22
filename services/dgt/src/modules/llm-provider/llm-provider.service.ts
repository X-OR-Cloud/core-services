import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import axios from 'axios';
import { BaseService } from '@hydrabyte/base';
import { RequestContext, PredefinedRole } from '@hydrabyte/shared';
import { LlmProvider, LlmProviderDocument, LlmProviderStatus, LlmProviderSchema } from './llm-provider.schema';
import { CreateLlmProviderDto, UpdateLlmProviderDto, UpdateStatusDto } from './llm-provider.dto';

const ENCRYPTION_KEY = process.env['API_SECRET_KEY'] || 'dgt-default-secret-key-32chars!!';
const KEY = createHash('sha256').update(ENCRYPTION_KEY).digest();

function encryptKey(plain: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptKey(encrypted: string): string {
  const [ivHex, encHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv('aes-256-cbc', KEY, iv);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function maskApiKey(raw: string): string {
  if (raw.length <= 8) return '****';
  return raw.slice(0, 4) + '...' + raw.slice(-4);
}

async function testProviderConnection(
  schema: string,
  baseUrl: string,
  apiKeyValue: string,
  model: string,
): Promise<void> {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body: any = {
    model,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 5,
  };
  if (schema === LlmProviderSchema.ANTHROPIC) {
    body['max_tokens'] = body['max_tokens'] ?? 5;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (schema === LlmProviderSchema.ANTHROPIC) {
    headers['x-api-key'] = apiKeyValue;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${apiKeyValue}`;
  }

  try {
    await axios.post(endpoint, body, { headers, timeout: 30_000 });
  } catch (err: any) {
    const status = err.response?.status;
    // 4xx trả về từ LLM (e.g. 400 bad request nhưng connect được) vẫn ok — chỉ reject 401/403
    if (status === 401 || status === 403) {
      throw new BadRequestException(`API key không hợp lệ (HTTP ${status})`);
    }
    // Timeout hoặc network error → không thể kết nối
    if (!status) {
      throw new BadRequestException(`Không thể kết nối tới provider: ${err.message}`);
    }
    // 400/429/500... → kết nối được, coi là pass
  }
}

@Injectable()
export class LlmProviderService extends BaseService<LlmProvider> {
  constructor(
    @InjectModel(LlmProvider.name) model: Model<LlmProvider>,
  ) {
    super(model);
  }

  private requireOwner(context: RequestContext): void {
    const isOwner =
      context.roles?.includes(PredefinedRole.OrganizationOwner) ||
      context.roles?.includes(PredefinedRole.UniverseOwner);
    if (!isOwner) throw new ForbiddenException('Chỉ Organization Owner mới được thực hiện thao tác này');
  }

  async createProvider(dto: CreateLlmProviderDto, context: RequestContext): Promise<LlmProvider> {
    this.requireOwner(context);

    // Test connection trước khi tạo
    await testProviderConnection(dto.schema, dto.baseUrl, dto.apiKeyValue, dto.model);

    const encryptedValue = encryptKey(dto.apiKeyValue);
    const maskedValue = maskApiKey(dto.apiKeyValue);

    const data: any = {
      name: dto.name,
      schema: dto.schema,
      baseUrl: dto.baseUrl,
      apiKey: { maskedValue, encryptedValue },
      model: dto.model,
      status: LlmProviderStatus.ACTIVE,
      priority: dto.priority ?? 10,
      defaultParams: dto.defaultParams ?? {},
      stats: {
        totalCalls: 0,
        successCalls: 0,
        errorCalls: 0,
        consecutiveErrors: 0,
        avgLatencyMs: 0,
        totalTokensUsed: 0,
        lastUsedAt: null,
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    };

    return (super.create(data as any, context)) as any;
  }

  async updateProvider(id: string, dto: UpdateLlmProviderDto, context: RequestContext): Promise<LlmProvider> {
    this.requireOwner(context);

    const existing = await this.model.findOne({ _id: id, isDeleted: { $ne: true } }).lean();
    if (!existing) throw new NotFoundException('LLM Provider không tồn tại');

    // Nếu có thay đổi connection info → test lại
    const needsTest = dto.baseUrl || dto.apiKeyValue || dto.model || dto.schema;
    if (needsTest) {
      const schema = dto.schema ?? existing.schema;
      const baseUrl = dto.baseUrl ?? existing.baseUrl;
      const model = dto.model ?? existing.model;
      const rawKey = dto.apiKeyValue
        ? dto.apiKeyValue
        : decryptKey(existing.apiKey.encryptedValue);
      await testProviderConnection(schema, baseUrl, rawKey, model);
    }

    const update: any = {};
    if (dto.name) update['name'] = dto.name;
    if (dto.schema) update['schema'] = dto.schema;
    if (dto.baseUrl) update['baseUrl'] = dto.baseUrl;
    if (dto.model) update['model'] = dto.model;
    if (dto.priority !== undefined) update['priority'] = dto.priority;
    if (dto.defaultParams) update['defaultParams'] = dto.defaultParams;
    if (dto.apiKeyValue) {
      update['apiKey'] = {
        maskedValue: maskApiKey(dto.apiKeyValue),
        encryptedValue: encryptKey(dto.apiKeyValue),
      };
    }
    // Reset status về active khi update thành công
    if (existing.status === LlmProviderStatus.ERROR) {
      update['status'] = LlmProviderStatus.ACTIVE;
      update['stats.consecutiveErrors'] = 0;
    }

    const updated = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { $set: { ...update, updatedBy: context.userId } },
      { new: true },
    ).lean();

    return updated as LlmProvider;
  }

  async listProviders(context: RequestContext): Promise<LlmProvider[]> {
    this.requireOwner(context);
    return this.model.find({ isDeleted: { $ne: true } }).sort({ priority: 1 }).lean() as any;
  }

  async getProvider(id: string, context: RequestContext): Promise<LlmProvider> {
    this.requireOwner(context);
    const doc = await this.model.findOne({ _id: id, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new NotFoundException('LLM Provider không tồn tại');
    return doc as LlmProvider;
  }

  async updateStatus(id: string, dto: UpdateStatusDto, context: RequestContext): Promise<LlmProvider> {
    this.requireOwner(context);
    const updated = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { $set: { status: dto.status, updatedBy: context.userId } },
      { new: true },
    ).lean();
    if (!updated) throw new NotFoundException('LLM Provider không tồn tại');
    return updated as LlmProvider;
  }

  async deleteProvider(id: string, context: RequestContext): Promise<void> {
    this.requireOwner(context);
    const result = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, updatedBy: context.userId } },
    );
    if (!result) throw new NotFoundException('LLM Provider không tồn tại');
  }

  // Internal — dùng cho LlmRouterService
  async getActiveProviders(): Promise<any[]> {
    return this.model
      .find({ status: LlmProviderStatus.ACTIVE, isDeleted: { $ne: true } })
      .sort({ priority: 1 })
      .lean() as any;
  }

  async recordSuccess(id: string, latencyMs: number, tokensUsed: number): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      {
        $inc: {
          'stats.totalCalls': 1,
          'stats.successCalls': 1,
          'stats.totalTokensUsed': tokensUsed,
        },
        $set: {
          'stats.consecutiveErrors': 0,
          'stats.lastUsedAt': new Date(),
          // Running average latency
          'stats.avgLatencyMs': latencyMs, // Updated below via aggregation-friendly formula
        },
      },
    );
    // Recalculate avgLatencyMs properly
    const doc = await this.model.findById(id).select('stats.avgLatencyMs stats.successCalls').lean() as any;
    if (doc) {
      const n = doc.stats.successCalls;
      const prevAvg = doc.stats.avgLatencyMs ?? 0;
      const newAvg = n <= 1 ? latencyMs : Math.round(prevAvg + (latencyMs - prevAvg) / n);
      await this.model.updateOne({ _id: id }, { $set: { 'stats.avgLatencyMs': newAvg } });
    }
  }

  async recordError(id: string, errorMessage: string): Promise<void> {
    const result = await this.model.findOneAndUpdate(
      { _id: id },
      {
        $inc: { 'stats.totalCalls': 1, 'stats.errorCalls': 1, 'stats.consecutiveErrors': 1 },
        $set: { 'stats.lastErrorAt': new Date(), 'stats.lastErrorMessage': errorMessage },
      },
      { new: true },
    ).lean() as any;

    // Auto-mark error nếu >= 3 lần liên tiếp
    if (result && result.stats?.consecutiveErrors >= 3) {
      await this.model.updateOne({ _id: id }, { $set: { status: LlmProviderStatus.ERROR } });
    }
  }

  // Expose decrypt cho LlmRouterService
  decryptApiKey(encryptedValue: string): string {
    return decryptKey(encryptedValue);
  }
}
