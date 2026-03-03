import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { Trade } from './trade.schema';

@Injectable()
export class TradeService extends BaseService<Trade> {
  constructor(
    @InjectModel(Trade.name) tradeModel: Model<Trade>,
  ) {
    super(tradeModel as any);
  }
}
