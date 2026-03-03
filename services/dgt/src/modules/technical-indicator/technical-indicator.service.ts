import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SharedDataService } from '../../shared/shared-data.service';
import { TechnicalIndicator } from './technical-indicator.schema';

@Injectable()
export class TechnicalIndicatorService extends SharedDataService<TechnicalIndicator> {
  constructor(
    @InjectModel(TechnicalIndicator.name) model: Model<TechnicalIndicator>,
  ) {
    super(model);
  }
}
