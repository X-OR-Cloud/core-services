import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RequestContext } from '@hydrabyte/shared';
import { Order, OrderDocument } from '../order/order.schema';
import { Trade, TradeDocument } from './trade.schema';
import { Position, PositionDocument } from '../position/position.schema';
import { Account, AccountDocument } from '../account/account.schema';
import { Signal, SignalDocument } from '../signal/signal.schema';

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

    // 3. Find account
    const accountQuery: Record<string, any> = { 'owner.userId': userId };
    if (accountId) {
      accountQuery['_id'] = accountId;
    } else {
      accountQuery['isDefault'] = true;
    }
    const account = await this.accountModel.findOne(accountQuery).lean().exec();
    if (!account) throw new NotFoundException('Account not found');

    // 4. Calculate estimated value
    const estimatedValue = (signal.priceAtCreation || 0) * quantity;

    // 5. Check balance
    if (account.balance < estimatedValue) {
      throw new BadRequestException(`Insufficient balance. Available: $${account.balance}`);
    }

    // 6. Create Order (paper trading — simulate immediate market fill)
    const order = await this.orderModel.create({
      accountId: account._id,
      symbol: signal.asset,
      side: signal.signalType === 'BUY' ? 'buy' : 'sell',
      orderType: 'market',
      quantity,
      status: 'filled',
      filledQuantity: quantity,
      averageFilledPrice: signal.priceAtCreation || 0,
      exchange: 'paper',
      source: 'manual',
      signalId: signal._id,
      filledAt: new Date(),
      owner: { userId, orgId: context.orgId },
    });

    // 7. Create Trade record
    await this.tradeModel.create({
      accountId: account._id,
      orderId: order._id,
      symbol: signal.asset,
      side: order.side,
      filledPrice: order.averageFilledPrice,
      filledQuantity: quantity,
      notionalUsd: (order.averageFilledPrice || 0) * quantity,
      fees: 0,
      executedAt: new Date(),
      owner: { userId, orgId: context.orgId },
    });

    // 8. Calculate SL/TP prices from signal percentages
    // TODO: use bot config when available
    const entryPrice = order.averageFilledPrice || signal.priceAtCreation || 0;
    const slPrice = signal.signalType === 'BUY' ? entryPrice * 0.98 : entryPrice * 1.02;
    const tpPrice = signal.signalType === 'BUY' ? entryPrice * 1.04 : entryPrice * 0.96;

    // 9. Create Position
    const position = await this.positionModel.create({
      accountId: account._id,
      symbol: signal.asset,
      side: signal.signalType === 'BUY' ? 'long' : 'short',
      entryPrice,
      quantity,
      notionalUsd: entryPrice * quantity,
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

    // 10. Update account balance (deduct for BUY)
    if (signal.signalType === 'BUY') {
      await this.accountModel.findByIdAndUpdate(account._id, {
        $inc: { balance: -(entryPrice * quantity) },
      });
    }

    // 11. Update signal status to EXECUTED
    await this.signalModel.findByIdAndUpdate(signal._id, {
      status: 'EXECUTED',
      executedAt: new Date(),
    });

    return { order, position };
  }
}
