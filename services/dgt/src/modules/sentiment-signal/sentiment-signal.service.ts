import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SharedDataService } from '../../shared/shared-data.service';
import { SentimentSignal } from './sentiment-signal.schema';

@Injectable()
export class SentimentSignalService extends SharedDataService<SentimentSignal> {
  constructor(
    @InjectModel(SentimentSignal.name) model: Model<SentimentSignal>,
  ) {
    super(model);
  }
}
