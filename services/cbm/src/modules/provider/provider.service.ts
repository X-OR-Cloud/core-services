import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'crypto';
import { Provider } from './provider.schema';

const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt plaintext using AES-256-GCM.
 * Key must be 32 bytes (from env CBM_PROVIDER_CONFIG_KEY, hex-encoded 64 chars).
 * Output format: iv(24 hex) + authTag(32 hex) + ciphertext(hex)
 */
export function encryptConfig(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + tag.toString('hex') + encrypted.toString('hex');
}

/**
 * Decrypt ciphertext produced by encryptConfig().
 */
export function decryptConfig(encryptedHex: string, key: Buffer): string {
  const iv = Buffer.from(encryptedHex.slice(0, 24), 'hex');
  const tag = Buffer.from(encryptedHex.slice(24, 56), 'hex');
  const encrypted = Buffer.from(encryptedHex.slice(56), 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

@Injectable()
export class ProviderService extends BaseService<Provider> {
  private readonly encryptionKey: Buffer;

  constructor(@InjectModel(Provider.name) private providerModel: Model<Provider>) {
    super(providerModel);

    const keyHex = process.env.CBM_PROVIDER_CONFIG_KEY;
    if (!keyHex || keyHex.length !== 64) {
      throw new Error('CBM_PROVIDER_CONFIG_KEY must be a 64-char hex string (32 bytes)');
    }
    this.encryptionKey = Buffer.from(keyHex, 'hex');
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(data: any, context: RequestContext): Promise<Partial<Provider>> {
    const encryptedConfig = encryptConfig(JSON.stringify(data.config), this.encryptionKey);
    const provider = await super.create({ ...data, config: encryptedConfig }, context);
    return this.stripConfig(provider);
  }

  async findAll(
    options: FindManyOptions,
    context: RequestContext,
  ): Promise<FindManyResult<Provider>> {
    const result = await super.findAll(options, context);
    result.data = result.data.map((p) => this.stripConfig(p)) as any;
    return result;
  }

  async findById(id: ObjectId, context: RequestContext): Promise<Partial<Provider>> {
    const provider = await super.findById(id, context);
    if (!provider) throw new NotFoundException('Provider not found');
    return this.stripConfig(provider);
  }

  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<Provider>> {
    await this.assertExists(id, context);
    // Only allow updating name and status via this method
    const { name, status } = data;
    const updated = await super.update(id, { name, status }, context);
    return this.stripConfig(updated);
  }

  async updateConfig(id: ObjectId, config: Record<string, any>, context: RequestContext): Promise<Partial<Provider>> {
    await this.assertExists(id, context);
    const encryptedConfig = encryptConfig(JSON.stringify(config), this.encryptionKey);
    const updated = await super.update(id, { config: encryptedConfig, status: 'inactive', lastError: undefined }, context);
    return this.stripConfig(updated);
  }

  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Provider>> {
    await this.assertExists(id, context);
    return super.softDelete(id, context);
  }

  // ─── Test connection ───────────────────────────────────────────────────────

  async testConnection(id: ObjectId, context: RequestContext): Promise<{ success: boolean; message: string }> {
    const provider = await super.findById(id, context);
    if (!provider) throw new NotFoundException('Provider not found');

    let config: Record<string, any>;
    try {
      config = JSON.parse(decryptConfig(provider.config as string, this.encryptionKey));
    } catch {
      throw new BadRequestException('Failed to decrypt provider config');
    }

    try {
      if (provider.provider === 'payos') {
        // Ping PayOS by fetching a non-existent order — if it returns 404 from PayOS (not a network error), connection is OK
        const PayOS = require('@payos/node');
        const payos = new PayOS(config.clientId, config.apiKey, config.checksumKey);
        await payos.getPaymentLinkInformation('test-connection-probe').catch((e: any) => {
          if (!e?.message?.includes('network') && !e?.message?.includes('ECONNREFUSED')) return; // PayOS responded = OK
          throw e;
        });
      }
      await this.providerModel.updateOne(
        { _id: id },
        { $set: { lastTestedAt: new Date(), status: 'active', lastError: undefined } },
      );
      return { success: true, message: 'Connection successful' };
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      await this.providerModel.updateOne(
        { _id: id },
        { $set: { status: 'error', lastError: msg } },
      );
      return { success: false, message: msg };
    }
  }

  // ─── Webhook verification ──────────────────────────────────────────────────

  /**
   * Verify incoming webhook signature and return parsed data.
   * Called by ProviderController — NOT authenticated by JwtAuthGuard.
   */
  async verifyAndParseWebhook(
    id: string,
    body: any,
  ): Promise<{ orderCode: number; paymentLinkId: string; paidAt: Date; amount: number }> {
    const provider = await this.providerModel.findOne({ _id: id, isDeleted: { $ne: true } }).lean();
    if (!provider) throw new NotFoundException('Provider not found');

    let config: Record<string, any>;
    try {
      config = JSON.parse(decryptConfig(provider.config as string, this.encryptionKey));
    } catch {
      throw new BadRequestException('Failed to decrypt provider config');
    }

    if (provider.provider === 'payos') {
      const PayOS = require('@payos/node');
      const payos = new PayOS(config.clientId, config.apiKey, config.checksumKey);
      try {
        const data = payos.verifyPaymentWebhookData(body);
        return {
          orderCode: data.orderCode,
          paymentLinkId: data.paymentLinkId,
          amount: data.amount,
          paidAt: data.transactionDateTime ? new Date(data.transactionDateTime) : new Date(),
        };
      } catch {
        throw new BadRequestException('Invalid webhook signature');
      }
    }

    throw new BadRequestException(`Webhook not supported for provider: ${provider.provider}`);
  }

  // ─── Internal helper: get active payment-gateway config ───────────────────

  /**
   * Used by PaymentService (via direct model injection) to avoid circular dep.
   * Returns decrypted config for the active payment-gateway of an org.
   */
  getEncryptionKey(): Buffer {
    return this.encryptionKey;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private stripConfig(provider: Partial<Provider>): Partial<Provider> {
    const plain = (provider as any).toObject ? (provider as any).toObject() : provider;
    const { config: _config, ...rest } = plain;
    return rest;
  }

  private async assertExists(id: ObjectId, context: RequestContext): Promise<void> {
    const p = await super.findById(id, context);
    if (!p) throw new NotFoundException('Provider not found');
  }
}
