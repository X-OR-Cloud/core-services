import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createLogger } from '@hydrabyte/shared';
import { Position, PositionDocument, PositionStatus, CloseReason, MonitoringStatus } from '../modules/position/position.schema';
import { Account, AccountDocument } from '../modules/account/account.schema';
import { Order, OrderDocument, OrderSide, OrderType, OrderStatus, OrderSource } from '../modules/order/order.schema';
import { MarketPrice, MarketPriceDocument } from '../modules/market-price/market-price.schema';
import { NotificationService } from '../shared/notification.service';

@Injectable()
export class MonitoringWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = createLogger('MonitoringWorker');
  private intervalHandle: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 10_000; // 10 seconds

  constructor(
    @InjectModel(Position.name) private readonly positionModel: Model<PositionDocument>,
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(MarketPrice.name) private readonly marketPriceModel: Model<MarketPriceDocument>,
    private readonly notificationService: NotificationService,
  ) {}

  onApplicationBootstrap() {
    const mode = process.env['MODE'];
    if (mode !== 'mon') return;
    this.logger.info('Starting SL/TP Monitoring Worker...');
    this.intervalHandle = setInterval(() => this.monitor(), this.POLL_INTERVAL_MS);
  }

  onApplicationShutdown() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.logger.info('Monitoring Worker stopped');
    }
  }

  private async monitor(): Promise<void> {
    try {
      // 1. Find all open positions with active monitoring
      const openPositions = await this.positionModel
        .find({ status: PositionStatus.OPEN, monitoringStatus: MonitoringStatus.ACTIVE })
        .lean()
        .exec();

      if (!openPositions.length) return;

      this.logger.debug(`Monitoring ${openPositions.length} open positions`);

      for (const position of openPositions) {
        await this.checkPosition(position);
      }
    } catch (error: any) {
      this.logger.error(`Monitor cycle error: ${error.message}`);
    }
  }

  private async checkPosition(position: any): Promise<void> {
    // Get latest price for this symbol from binance_spot source
    const latestPrice = await this.marketPriceModel
      .findOne({ symbol: position.symbol, source: 'binance_spot' })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    if (!latestPrice) return;

    const currentPrice = latestPrice.close;

    // Update currentPrice and unrealizedPnl
    const unrealizedPnl =
      position.side === 'long'
        ? (currentPrice - position.entryPrice) * position.quantity
        : (position.entryPrice - currentPrice) * position.quantity;
    const unrealizedPnlPct =
      position.notionalUsd > 0 ? (unrealizedPnl / position.notionalUsd) * 100 : 0;

    await this.positionModel.findByIdAndUpdate(position._id, {
      currentPrice,
      unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
      unrealizedPnlPct: Math.round(unrealizedPnlPct * 100) / 100,
    });

    // Check SL/TP
    const isLong = position.side === 'long';
    const slHit =
      position.stopLossPrice &&
      (isLong
        ? currentPrice <= position.stopLossPrice
        : currentPrice >= position.stopLossPrice);
    const tpHit =
      position.takeProfitPrice &&
      (isLong
        ? currentPrice >= position.takeProfitPrice
        : currentPrice <= position.takeProfitPrice);

    if (slHit || tpHit) {
      const closeReason = tpHit ? CloseReason.TAKE_PROFIT : CloseReason.STOP_LOSS;
      await this.closePosition(position, currentPrice, closeReason);
    }
  }

  private async closePosition(
    position: any,
    exitPrice: number,
    closeReason: CloseReason,
  ): Promise<void> {
    const realizedPnl =
      position.side === 'long'
        ? (exitPrice - position.entryPrice) * position.quantity
        : (position.entryPrice - exitPrice) * position.quantity;

    // Create close order
    await this.orderModel.create({
      accountId: position.accountId,
      symbol: position.symbol,
      side: position.side === 'long' ? OrderSide.SELL : OrderSide.BUY,
      orderType: OrderType.MARKET,
      quantity: position.quantity,
      status: OrderStatus.FILLED,
      filledQuantity: position.quantity,
      averageFilledPrice: exitPrice,
      exchange: 'paper',
      source: OrderSource.SYSTEM,
      filledAt: new Date(),
      owner: { userId: 'system', orgId: 'system' },
    });

    // Update position to closed
    await this.positionModel.findByIdAndUpdate(position._id, {
      status: PositionStatus.CLOSED,
      monitoringStatus: MonitoringStatus.CLOSED,
      exitPrice,
      realizedPnl: Math.round(realizedPnl * 100) / 100,
      closeReason,
      closedAt: new Date(),
      currentPrice: exitPrice,
    });

    // Update account balance (add proceeds for long, deduct for short)
    const proceeds = exitPrice * position.quantity;
    await this.accountModel.findByIdAndUpdate(position.accountId, {
      $inc: { balance: proceeds },
    });

    this.logger.info(
      `[Monitor] Closed position ${position._id} (${closeReason}) at ${exitPrice}, PnL: ${realizedPnl.toFixed(2)}`,
    );

    // Send notification
    const isTp = closeReason === CloseReason.TAKE_PROFIT;
    await this.notificationService.notifyAccount(position.accountId, {
      title: isTp ? '✅ Take Profit Hit' : '🛑 Stop Loss Hit',
      message: `Position ${position.symbol} (${position.side.toUpperCase()}) closed at ${exitPrice}`,
      level: isTp ? 'success' : 'error',
      data: {
        Symbol: position.symbol,
        Side: position.side.toUpperCase(),
        'Entry Price': `${position.entryPrice}`,
        'Exit Price': `${exitPrice}`,
        'Realized PnL': `${realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}`,
        Reason: isTp ? 'Take Profit' : 'Stop Loss',
      },
    });
  }
}
