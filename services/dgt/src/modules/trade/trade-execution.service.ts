import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RequestContext } from '@hydrabyte/shared';
import { Order, OrderDocument } from '../order/order.schema';
import { Trade, TradeDocument } from './trade.schema';
import { Position, PositionDocument } from '../position/position.schema';
import { Account, AccountDocument } from '../account/account.schema';
import { Signal, SignalDocument } from '../signal/signal.schema';
import { ExchangeAdapterFactory } from '../../exchange/exchange-adapter.factory';

export class ExecuteFromSignalDto {
  signalId: string;
  quantity: number;
  accountId?: string;
}

@Injectable()
export class TradeExecutionService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Trade.name) private readonly tradeModel: Model<TradeDocument>,
    @InjectModel(Position.name) private readonly positionModel: Model<PositionDocument>,
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(Signal.name) private readonly signalModel: Model<SignalDocument>,
    private readonly adapterFactory: ExchangeAdapterFactory,
  ) {}

  async executeFromSignal(
    userId: string,
    dto: ExecuteFromSignalDto,
    context: RequestContext,
  ): Promise<{ order: any; position: any }> {
    const { signalId, quantity, accountId } = dto;

    // 1. Find signal
    const signal = await this.signalModel.findById(signalId).lean().exec();
    if (!signal) throw new NotFoundException(`Signal ${signalId} not found`);

    // 2. Pre-trade risk checks
    const now = Date.now();

    // a. Signal must be ACTIVE
    if (signal.status !== 'ACTIVE') {
      throw new BadRequestException('Signal is no longer active');
    }

    // b. Signal must not be expired
    if (signal.expiresAt && signal.expiresAt.getTime() <= now) {
      throw new BadRequestException('Signal has expired. Please check for new signals.');
    }

    // c. Signal age < 30 minutes
    const signalAge = now - (signal as any).createdAt.getTime();
    if (signalAge >= 30 * 60 * 1000) {
      throw new BadRequestException('Signal has expired (older than 30 minutes).');
    }

    // d. signalType must be BUY or SELL
    if (signal.signalType === 'HOLD') {
      throw new BadRequestException('Cannot execute a HOLD signal.');
    }

    // 3. Find account (raw — cần apiKey/apiSecret chưa mask)
    const accountQuery: Record<string, any> = { 'owner.userId': userId };
    if (accountId) {
      accountQuery['_id'] = accountId;
    } else {
      accountQuery['isDefault'] = true;
    }
    const account = await this.accountModel.findOne(accountQuery).lean().exec();
    if (!account) throw new NotFoundException('Account not found');

    // ─── SELL SIGNAL: Close existing LONG position (SPOT-only, no short selling) ───
    if (signal.signalType === 'SELL') {
      return this.closeLongPosition(signal, account, userId, context);
    }

    // ─── BUY SIGNAL: Open new LONG position ──────────────────────────────────────

    // 4. Calculate estimated value
    const estimatedValue = (signal.priceAtCreation || 0) * quantity;

    // 5. Check balance
    if (account.balance < estimatedValue) {
      throw new BadRequestException(`Insufficient balance. Available: $${account.balance}`);
    }

    // 6. Get exchange adapter và đặt lệnh
    const adapter = this.adapterFactory.createAdapter(account as any);

    const orderResult = await adapter.placeMarketOrder({
      symbol: signal.asset,
      side: 'BUY',
      type: 'MARKET',
      quantity,
      price: signal.priceAtCreation || 0,
    });

    // 7. Resolve filled price: dùng giá từ exchange, fallback về signal price
    const filledPrice = orderResult.averageFilledPrice || signal.priceAtCreation || 0;
    const filledQty = orderResult.filledQuantity || quantity;

    // 8. Create Order record
    const order = await this.orderModel.create({
      accountId: account._id,
      symbol: signal.asset,
      side: 'buy',
      orderType: 'market',
      quantity,
      status: orderResult.status === 'filled' ? 'filled' : 'pending',
      filledQuantity: filledQty,
      averageFilledPrice: filledPrice,
      exchange: account.exchange || 'binance',
      exchangeOrderId: orderResult.exchangeOrderId,
      fees: orderResult.fees,
      feeAsset: orderResult.feeAsset,
      source: 'manual',
      signalId: signal._id,
      filledAt: orderResult.filledAt || new Date(),
      owner: { userId, orgId: context.orgId },
    });

    // 9. Create Trade record
    await this.tradeModel.create({
      accountId: account._id,
      orderId: order._id,
      symbol: signal.asset,
      side: 'buy',
      filledPrice,
      filledQuantity: filledQty,
      notionalUsd: filledPrice * filledQty,
      fees: orderResult.fees,
      executedAt: new Date(),
      owner: { userId, orgId: context.orgId },
    });

    // 10. Calculate SL/TP for LONG position
    // signal.stopLoss/takeProfit are ABSOLUTE prices; fallback to fixed % if absent
    const entryPrice = filledPrice;
    const slPrice = signal.stopLoss ?? entryPrice * (1 - 2 / 100); // 2% below
    const tpPrice = signal.takeProfit ?? entryPrice * (1 + 4 / 100); // 4% above

    // 11. Create LONG Position
    const position = await this.positionModel.create({
      accountId: account._id,
      symbol: signal.asset,
      side: 'long',
      entryPrice,
      quantity: filledQty,
      notionalUsd: entryPrice * filledQty,
      currentPrice: entryPrice,
      unrealizedPnl: 0,
      unrealizedPnlPct: 0,
      stopLossPrice: slPrice,
      takeProfitPrice: tpPrice,
      leverage: 1,
      status: 'open',
      openedAt: new Date(),
      signalId: signal._id,
      monitoringStatus: 'active',
      owner: { userId, orgId: context.orgId },
    });

    // 12. Deduct balance for BUY
    await this.accountModel.findByIdAndUpdate(account._id, {
      $inc: { balance: -(entryPrice * filledQty) },
    });

    // 13. Mark signal EXECUTED
    await this.signalModel.findByIdAndUpdate(signal._id, {
      status: 'EXECUTED',
      executedAt: new Date(),
    });

    return { order, position };
  }

  /**
   * SELL signal (SPOT-only) = Close existing open LONG position.
   * Platform does NOT support short selling — SELL always closes a LONG.
   * If no open LONG exists for the asset, throw an error.
   */
  private async closeLongPosition(
    signal: any,
    account: any,
    userId: string,
    context: RequestContext,
  ): Promise<{ order: any; position: any }> {
    // 1. Find existing open LONG position for this asset
    const longPosition = await this.positionModel.findOne({
      accountId: account._id,
      symbol: signal.asset,
      side: 'long',
      status: 'open',
    }).lean().exec();

    if (!longPosition) {
      throw new BadRequestException(
        `No open LONG position found for ${signal.asset}. SELL signal requires an existing LONG to close.`,
      );
    }

    // 2. Place SELL order on exchange to close the LONG
    const adapter = this.adapterFactory.createAdapter(account as any);
    const orderResult = await adapter.placeMarketOrder({
      symbol: signal.asset,
      side: 'SELL',
      type: 'MARKET',
      quantity: longPosition.quantity,
      price: signal.priceAtCreation || 0,
    });

    const exitPrice = orderResult.averageFilledPrice || signal.priceAtCreation || 0;
    const exitQty = orderResult.filledQuantity || longPosition.quantity;
    const fees = orderResult.fees || 0;

    // 3. Create Order record (close order)
    const order = await this.orderModel.create({
      accountId: account._id,
      symbol: signal.asset,
      side: 'sell',
      orderType: 'market',
      quantity: longPosition.quantity,
      status: orderResult.status === 'filled' ? 'filled' : 'pending',
      filledQuantity: exitQty,
      averageFilledPrice: exitPrice,
      exchange: account.exchange || 'binance',
      exchangeOrderId: orderResult.exchangeOrderId,
      fees,
      feeAsset: orderResult.feeAsset,
      source: 'manual',
      signalId: signal._id,
      filledAt: orderResult.filledAt || new Date(),
      owner: { userId, orgId: context.orgId },
    });

    // 4. Create Trade record
    await this.tradeModel.create({
      accountId: account._id,
      orderId: order._id,
      symbol: signal.asset,
      side: 'sell',
      filledPrice: exitPrice,
      filledQuantity: exitQty,
      notionalUsd: exitPrice * exitQty,
      fees,
      executedAt: new Date(),
      owner: { userId, orgId: context.orgId },
    });

    // 5. Calculate realized PnL for the LONG position
    const grossPnl = (exitPrice - longPosition.entryPrice) * exitQty;
    const realizedPnl = Math.round((grossPnl - fees) * 100) / 100;

    // 6. Close the existing LONG position (update, not create new)
    const closedPosition = await this.positionModel.findByIdAndUpdate(
      longPosition._id,
      {
        status: 'closed',
        monitoringStatus: 'closed',
        exitPrice,
        realizedPnl,
        closeReason: 'manual',
        closedAt: new Date(),
        currentPrice: exitPrice,
      },
      { new: true },
    );

    // 7. Add SELL proceeds back to account balance
    await this.accountModel.findByIdAndUpdate(account._id, {
      $inc: { balance: exitPrice * exitQty },
    });

    // 8. Mark signal EXECUTED
    await this.signalModel.findByIdAndUpdate(signal._id, {
      status: 'EXECUTED',
      executedAt: new Date(),
    });

    return { order, position: closedPosition };
  }
}
