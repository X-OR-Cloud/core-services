import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios from 'axios';
import { createLogger } from '@hydrabyte/shared';
import { Account, AccountDocument } from '../modules/account/account.schema';

export interface NotificationPayload {
  title: string;
  message: string;
  level: 'info' | 'warning' | 'error' | 'success';
  data?: Record<string, any>;
}

@Injectable()
export class NotificationService {
  private readonly logger = createLogger('NotificationService');

  constructor(
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
  ) {}

  async notifyAccount(accountId: string | Types.ObjectId, payload: NotificationPayload): Promise<void> {
    const account = await this.accountModel.findById(accountId).lean().exec();
    if (!account || !account.notifications?.enabled) return;

    const { discordWebhookUrl, telegramBotToken, telegramChatId, telegramThreadId } = account.notifications;

    const promises: Promise<void>[] = [];

    if (discordWebhookUrl) {
      promises.push(this.sendDiscord(discordWebhookUrl, payload));
    }

    if (telegramBotToken && telegramChatId) {
      promises.push(this.sendTelegram(telegramBotToken, telegramChatId, payload, telegramThreadId));
    }

    await Promise.allSettled(promises);
  }

  private async sendDiscord(webhookUrl: string, payload: NotificationPayload): Promise<void> {
    const colorMap = { info: 0x3498db, warning: 0xf39c12, error: 0xe74c3c, success: 0x2ecc71 };
    const color = colorMap[payload.level] || 0x95a5a6;

    const embed: any = {
      title: payload.title,
      description: payload.message,
      color,
      timestamp: new Date().toISOString(),
      footer: { text: 'DGT · Digital Gold Trader' },
    };

    if (payload.data) {
      embed.fields = Object.entries(payload.data).map(([name, value]) => ({
        name,
        value: String(value),
        inline: true,
      }));
    }

    try {
      await axios.post(webhookUrl, { embeds: [embed] }, { timeout: 5000 });
      this.logger.info(`[Notification] Discord sent: ${payload.title}`);
    } catch (error: any) {
      this.logger.error(`[Notification] Discord failed: ${error.message}`);
    }
  }

  private async sendTelegram(botToken: string, chatId: string, payload: NotificationPayload, threadId?: string): Promise<void> {
    const levelEmoji = { info: 'ℹ️', warning: '⚠️', error: '🔴', success: '✅' };
    const emoji = levelEmoji[payload.level] || '📢';

    let text = `${emoji} *${payload.title}*\n\n${payload.message}`;
    if (payload.data) {
      const lines = Object.entries(payload.data).map(([k, v]) => `• *${k}:* ${v}`);
      text += '\n\n' + lines.join('\n');
    }

    const body: Record<string, any> = { chat_id: chatId, text, parse_mode: 'Markdown' };
    if (threadId) {
      body['message_thread_id'] = Number(threadId);
    }

    try {
      await axios.post(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        body,
        { timeout: 5000 },
      );
      this.logger.info(`[Notification] Telegram sent: ${payload.title}`);
    } catch (error: any) {
      this.logger.error(`[Notification] Telegram failed: ${error.message}`);
    }
  }
}
