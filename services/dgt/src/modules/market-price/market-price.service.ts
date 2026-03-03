import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SharedDataService } from '../../shared/shared-data.service';
import { MarketPrice } from './market-price.schema';

@Injectable()
export class MarketPriceService extends SharedDataService<MarketPrice> {
  constructor(
    @InjectModel(MarketPrice.name) marketPriceModel: Model<MarketPrice>,
  ) {
    super(marketPriceModel);
  }
}
