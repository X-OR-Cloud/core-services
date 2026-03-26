/**
 * ExchangeAdapterFactory
 *
 * Tạo adapter phù hợp dựa trên account.exchange và account.accountType.
 * Nếu account chưa có API key → fallback LocalSimulationAdapter (backward compat).
 */
import { Injectable } from '@nestjs/common';
import { createHash, createDecipheriv } from 'crypto';
import { createLogger } from '@hydrabyte/shared';
import { IExchangeAdapter } from './exchange.interfaces';
import { BinanceAdapter } from './adapters/binance.adapter';
import { OKXAdapter } from './adapters/okx.adapter';
import { BybitAdapter } from './adapters/bybit.adapter';
import { LocalSimulationAdapter } from './adapters/local-simulation.adapter';

// Phải khớp với key trong account.service.ts
const ENCRYPTION_KEY = process.env['API_SECRET_KEY'] || 'dgt-default-secret-key-32chars!!';
const AES_KEY = createHash('sha256').update(ENCRYPTION_KEY).digest();

function decryptSecret(encrypted: string): string {
  const [ivHex, encHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv('aes-256-cbc', AES_KEY, iv);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

@Injectable()
export class ExchangeAdapterFactory {
  private readonly logger = createLogger('ExchangeAdapterFactory');

  /**
   * Tạo adapter cho account.
   * @param account Raw Mongoose document hoặc plain object (cần: exchange, accountType, apiKey, apiSecret)
   */
  createAdapter(account: {
    exchange: string;
    accountType: string;
    apiKey?: string;
    apiSecret?: string;
  }): IExchangeAdapter {
    const { exchange, accountType, apiKey, apiSecret } = account;
    const isTestnet = accountType === 'paper'; // paper = Binance Demo (demo-api.binance.com)

    // Fallback nếu không có API key
    if (!apiKey || !apiSecret) {
      this.logger.warn(
        `[Factory] Account (exchange=${exchange}, type=${accountType}) has no API key → using LocalSimulationAdapter`,
      );
      return new LocalSimulationAdapter(exchange, accountType);
    }

    let decryptedSecret: string;
    try {
      decryptedSecret = decryptSecret(apiSecret);
    } catch (err: any) {
      this.logger.error(
        `[Factory] Failed to decrypt apiSecret for exchange=${exchange}: ${err?.message}. Falling back to simulation.`,
      );
      return new LocalSimulationAdapter(exchange, accountType);
    }

    const config = { apiKey, apiSecret: decryptedSecret, isTestnet };

    switch (exchange) {
      case 'binance':
        return new BinanceAdapter(config);
      case 'okx':
        return new OKXAdapter(config);
      case 'bybit':
        return new BybitAdapter(config);
      default:
        this.logger.warn(`[Factory] Unknown exchange "${exchange}" → LocalSimulationAdapter`);
        return new LocalSimulationAdapter(exchange, accountType);
    }
  }
}
