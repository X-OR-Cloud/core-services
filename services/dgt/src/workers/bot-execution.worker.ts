/**
 * BotExecutionWorker
 *
 * Chạy trong MODE=sig (sig00).
 * Poll 30s → tìm bot RUNNING → tìm signal ACTIVE phù hợp → execute trade tự động.
 *
 * Idempotency guard:
 *   Dùng findOneAndUpdate({botExecutedAt: null}) để atomic claim signal.
 *   Đảm bảo không double-execute khi worker restart.
 */
import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createLogger } from '@hydrabyte/shared';
import { Bot, BotDocument, BotStatus } from '../modules/bot/bot.schema';
import { Account, AccountDocument } from '../modules/account/account.schema';
import { Signal, SignalDocument } from '../modules/signal/signal.schema';
import { Position, PositionDocument } from '../modules/position/position.schema';
import { BotActivityLog, BotActivityLogDocument } from '../modules/bot-activity-log/bot-activity-log.schema';
import { ActivityActionType, ActivityStatus, PerformedBy } from '../modules/bot-activity-log/bot-activity-log.schema';
import { TradeExecutionService, ExecuteFromSignalDto } from '../modules/trade/trade-execution.service';
import { ExchangeAdapterFactory } from '../exchange/exchange-adapter.factory';

const POLL_INTERVAL_MS = 30_000; // 30 seconds

@Injectable()
export class BotExecutionWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = createLogger('BotExecutionWorker');
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(
    @InjectModel(Bot.name) private readonly botModel: Model<BotDocument>,
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(Signal.name) private readonly signalModel: Model<SignalDocument>,
    @InjectModel(Position.name) private readonly positionModel: Model<PositionDocument>,
    @InjectModel(BotActivityLog.name) private readonly activityLogModel: Model<BotActivityLogDocument>,
    private readonly tradeExecutionService: TradeExecutionService,
    private readonly adapterFactory: ExchangeAdapterFactory,
  ) {}

  onApplicationBootstrap() {
    const mode = process.env['MODE'];
    if (mode !== 'sig') return;
    this.logger.info('Starting BotExecutionWorker...');
    this.intervalHandle = setInterval(() => this.run(), POLL_INTERVAL_MS);
  }

  onApplicationShutdown() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.logger.info('BotExecutionWorker stopped');
    }
  }

  private async run(): Promise<void> {
    try {
      // 1. Tìm tất cả bot đang RUNNING
      const runningBots = await this.botModel
        .find({ status: BotStatus.RUNNING, isDeleted: false })
        .lean()
        .exec();

      if (!runningBots.length) return;

      this.logger.debug(`BotExecutionWorker: checking ${runningBots.length} running bots`);

      for (const bot of runningBots) {
        await this.processBotSignals(bot).catch((err) => {
          this.logger.error(
            `[BotExec] Error processing bot ${bot._id}: ${err?.message}`,
          );
        });
      }
    } catch (err: any) {
      this.logger.error(`[BotExec] Poll cycle error: ${err?.message}`);
    }
  }

  private async processBotSignals(bot: any): Promise<void> {
    const botId = (bot._id as Types.ObjectId).toString();

    // 2. Lấy account của bot
    const account = await this.accountModel
      .findById(bot.accountId)
      .lean()
      .exec();

    if (!account) {
      this.logger.warn(`[BotExec] Bot ${botId} has no account ${bot.accountId}`);
      return;
    }

    // 3. Check điều kiện tổng thể của bot
    if (!this.checkBotConditions(bot, account)) return;

    // 3b. Sync balance từ exchange trước khi check — đảm bảo dùng số dư thực tế
    //     (user có thể nạp thêm USDT trực tiếp trên sàn)
    const freshAccount = await this.syncAndGetFreshAccount(account);
    const accountWithFreshBalance = freshAccount ?? account;

    // 4. Tìm signal ACTIVE cho asset/timeframe của bot, chưa được execute bởi bot
    //    Atomic: dùng findOneAndUpdate để claim ngay
    const now = new Date();
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

    const signal = await this.signalModel.findOneAndUpdate(
      {
        accountId: new Types.ObjectId(bot.accountId.toString()),
        asset: bot.asset,
        timeframe: bot.timeframe,
        signalType: { $in: ['BUY', 'SELL'] },
        status: 'ACTIVE',
        botExecutedAt: null,        // chưa có bot nào claim
        expiresAt: { $gt: now },
        createdAt: { $gte: thirtyMinAgo }, // không quá 30 phút
      },
      {
        $set: {
          botExecutedAt: now,
          executedByBotId: bot._id,
        },
      },
      { new: true, sort: { createdAt: -1 }, lean: true },
    ).exec();

    if (!signal) return; // không có signal phù hợp

    this.logger.info(
      `[BotExec] Bot ${botId} claimed signal ${signal._id} (${signal.signalType}, confidence=${signal.confidence})`,
    );

    // 5. Validate confidence score
    if (signal.confidence < (bot.minConfidenceScore || 70)) {
      this.logger.info(
        `[BotExec] Signal ${signal._id} confidence ${signal.confidence} < minConfidence ${bot.minConfidenceScore}. Skipping.`,
      );
      await this.releaseSignalClaim(signal._id);
      await this.logActivity(bot, account, {
        action: 'Signal skipped: low confidence',
        actionType: ActivityActionType.INFO,
        details: `Signal ${signal._id} confidence ${signal.confidence} < threshold ${bot.minConfidenceScore}`,
        status: ActivityStatus.INFO,
      });
      return;
    }

    // 6. Position check — logic differs for BUY vs SELL (SPOT-only, no short selling)
    const existingLongPosition = await this.positionModel.findOne({
      accountId: bot.accountId,
      symbol: bot.asset,
      side: 'long',
      status: 'open',
      isDeleted: false,
    }).lean().exec();

    if (signal.signalType === 'BUY' && existingLongPosition) {
      // BUY: skip if already holding a LONG (prevent double-open)
      this.logger.info(
        `[BotExec] Bot ${botId} already has open LONG for ${bot.asset}. Skipping BUY signal ${signal._id}.`,
      );
      await this.releaseSignalClaim(signal._id);
      return;
    }

    if (signal.signalType === 'SELL' && !existingLongPosition) {
      // SELL: skip if no LONG to close (spot trading — cannot short)
      this.logger.info(
        `[BotExec] Bot ${botId} has no open LONG for ${bot.asset}. Skipping SELL signal ${signal._id} (no position to close).`,
      );
      await this.releaseSignalClaim(signal._id);
      return;
    }

    // 7. Check daily loss limit
    const today = new Date().toISOString().split('T')[0];
    const dailyTracking = bot.dailyLossTracking || { date: '', lossUsd: 0 };
    if (dailyTracking.date === today && dailyTracking.lossUsd >= bot.dailyStopLossUSD) {
      this.logger.warn(
        `[BotExec] Bot ${botId} daily loss limit reached ($${dailyTracking.lossUsd} >= $${bot.dailyStopLossUSD}). Pausing bot.`,
      );
      await this.botModel.findByIdAndUpdate(bot._id, { status: BotStatus.PAUSED });
      await this.releaseSignalClaim(signal._id);
      await this.logActivity(bot, account, {
        action: 'Bot paused: daily loss limit reached',
        actionType: ActivityActionType.WARNING,
        details: `Daily loss $${dailyTracking.lossUsd.toFixed(2)} >= limit $${bot.dailyStopLossUSD}`,
        status: ActivityStatus.WARNING,
      });
      return;
    }

    // 8. Calculate quantity
    // SELL: quantity is taken from existing LONG position (pass 0 — closeLongPosition handles it)
    // BUY: calculate from maxEntrySize and signal price
    const entryPrice = signal.priceAtCreation || 0;
    if (entryPrice <= 0) {
      this.logger.error(`[BotExec] Signal ${signal._id} has no valid price. Skipping.`);
      await this.releaseSignalClaim(signal._id);
      return;
    }

    let quantity = 0;
    if (signal.signalType === 'BUY') {
      quantity = Math.floor((bot.maxEntrySize / entryPrice) * 1e6) / 1e6; // 6 decimal precision
      if (quantity <= 0) {
        this.logger.error(
          `[BotExec] Calculated quantity ${quantity} is invalid for bot ${botId}. maxEntrySize=$${bot.maxEntrySize}, price=${entryPrice}`,
        );
        await this.releaseSignalClaim(signal._id);
        return;
      }
    } else {
      // SELL: closeLongPosition will use existingLongPosition.quantity directly
      quantity = existingLongPosition!.quantity;
    }

    // 9. Check balance (BUY only — SELL returns funds, no balance check needed)
    if (signal.signalType === 'BUY') {
      const estimatedCost = entryPrice * quantity;
      if (accountWithFreshBalance.balance < estimatedCost) {
        this.logger.warn(
          `[BotExec] Bot ${botId} insufficient balance: $${accountWithFreshBalance.balance} < $${estimatedCost.toFixed(2)}`,
        );
        await this.releaseSignalClaim(signal._id);
        await this.logActivity(bot, accountWithFreshBalance, {
          action: 'Trade skipped: insufficient balance',
          actionType: ActivityActionType.WARNING,
          details: `Balance $${accountWithFreshBalance.balance.toFixed(2)} < required $${estimatedCost.toFixed(2)} for ${quantity} ${bot.asset}`,
          status: ActivityStatus.WARNING,
        });
        return;
      }
    }

    // 10. Execute trade — tạo context giả cho bot execution
    const context = {
      userId: account.owner?.userId || 'bot',
      orgId: account.owner?.orgId || 'system',
      roles: [],
    };

    const dto: ExecuteFromSignalDto = {
      signalId: (signal._id as Types.ObjectId).toString(),
      quantity,
      accountId: (bot.accountId as Types.ObjectId).toString(),
    };

    try {
      const { order, position } = await this.tradeExecutionService.executeFromSignal(
        context.userId,
        dto,
        context as any,
      );

      // Update bot stats
      await this.botModel.findByIdAndUpdate(bot._id, {
        lastActiveAt: new Date(),
        $inc: { 'stats.totalTrades': 1 },
      });

      await this.logActivity(bot, account, {
        action: `Bot executed ${signal.signalType} trade`,
        actionType: signal.signalType === 'BUY' ? ActivityActionType.BUY : ActivityActionType.SELL,
        details: `Opened ${signal.signalType} position for ${quantity} ${bot.asset} at ~$${entryPrice}`,
        metadata: {
          signalId: signal._id,
          orderId: order._id,
          positionId: position._id,
          quantity,
          entryPrice,
          confidence: signal.confidence,
          takeProfit: signal.takeProfit ?? null,
          stopLoss: signal.stopLoss ?? null,
        },
        status: ActivityStatus.SUCCESS,
      });

      this.logger.info(
        `[BotExec] Bot ${botId} executed ${signal.signalType} trade: qty=${quantity} ${bot.asset} ` +
          `order=${order._id} position=${position._id}`,
      );

      // Auto-sync balance sau mỗi trade để cập nhật số dư thực tế
      this.syncAccountBalance(account).catch((err) => {
        this.logger.warn(`[BotExec] Auto-sync balance failed for account ${account._id}: ${err?.message}`);
      });
    } catch (execErr: any) {
      this.logger.error(
        `[BotExec] Bot ${botId} failed to execute trade for signal ${signal._id}: ${execErr?.message}`,
      );

      // Release signal claim khi execute thất bại
      await this.releaseSignalClaim(signal._id);

      await this.logActivity(bot, account, {
        action: 'Trade execution failed',
        actionType: ActivityActionType.ERROR,
        details: execErr?.message || 'Unknown error',
        status: ActivityStatus.ERROR,
      });
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Release signal claim khi không thực sự execute (để bot cycle tiếp theo có thể thử lại).
   * Chỉ release nếu signal vẫn ở trạng thái ACTIVE (chưa bị execute thật).
   */
  private async releaseSignalClaim(signalId: any): Promise<void> {
    await this.signalModel.findOneAndUpdate(
      { _id: signalId, status: 'ACTIVE' },
      { $unset: { botExecutedAt: 1, executedByBotId: 1 } },
    ).exec();
  }

  /**
   * Kiểm tra các điều kiện cơ bản của bot trước khi xử lý signal.
   * Trả về false nếu bot không nên execute.
   */
  private checkBotConditions(bot: any, account: any): boolean {
    if (account.status !== 'active') {
      this.logger.debug(`[BotExec] Bot ${bot._id}: account is not active`);
      return false;
    }
    if (!bot.asset || !bot.timeframe) {
      this.logger.warn(`[BotExec] Bot ${bot._id}: missing asset or timeframe config`);
      return false;
    }
    if (!bot.maxEntrySize || bot.maxEntrySize <= 0) {
      this.logger.warn(`[BotExec] Bot ${bot._id}: maxEntrySize not configured`);
      return false;
    }
    return true;
  }

  private async logActivity(
    bot: any,
    account: any,
    payload: {
      action: string;
      actionType: ActivityActionType;
      details: string;
      metadata?: Record<string, any>;
      status: ActivityStatus;
    },
  ): Promise<void> {
    try {
      await this.activityLogModel.create({
        botId: bot._id,
        accountId: account._id,
        action: payload.action,
        actionType: payload.actionType,
        details: payload.details,
        metadata: payload.metadata,
        performedBy: PerformedBy.SYSTEM,
        status: payload.status,
        owner: account.owner,
      });
    } catch (err: any) {
      this.logger.error(`[BotExec] Failed to write activity log: ${err?.message}`);
    }
  }

  /**
   * Sync balance từ exchange và trả về account với balance mới nhất.
   * Dùng TRƯỚC khi check balance để đảm bảo dùng số dư thực tế từ exchange.
   * Trả về null nếu không có API key hoặc sync thất bại (fallback về account cũ).
   */
  private async syncAndGetFreshAccount(account: any): Promise<any | null> {
    if (!account?.apiKey || !account?.apiSecret) return null;

    try {
      const adapter = this.adapterFactory.createAdapter({
        exchange: account.exchange,
        accountType: account.accountType,
        apiKey: account.apiKey,
        apiSecret: account.apiSecret,
      });

      const currency = account.currency || 'USDT';
      const balance = await adapter.getBalance(currency);

      // Cập nhật DB và trả về account với balance mới
      await this.accountModel.findByIdAndUpdate(account._id, { balance });
      this.logger.debug(`[BotExec] Synced balance for account ${account._id}: ${balance} ${currency}`);

      return { ...account, balance };
    } catch (err: any) {
      // Sync thất bại → fallback về balance cũ trong DB, không block execution
      this.logger.warn(`[BotExec] Pre-trade balance sync failed for account ${account._id}: ${err?.message}. Using cached balance.`);
      return null;
    }
  }

  /**
   * Sync balance từ exchange về DB sau mỗi trade.
   * Non-blocking — không ảnh hưởng đến flow execute trade.
   */
  private async syncAccountBalance(account: any): Promise<void> {
    if (!account?.apiKey || !account?.apiSecret) return;

    try {
      const adapter = this.adapterFactory.createAdapter({
        exchange: account.exchange,
        accountType: account.accountType,
        apiKey: account.apiKey,
        apiSecret: account.apiSecret,
      });

      const currency = account.currency || 'USDT';
      const balance = await adapter.getBalance(currency);

      await this.accountModel.findByIdAndUpdate(account._id, { balance });
      this.logger.info(`[BotExec] Synced balance for account ${account._id}: ${balance} ${currency}`);
    } catch (err: any) {
      throw new Error(`syncAccountBalance failed: ${err?.message}`);
    }
  }
}
