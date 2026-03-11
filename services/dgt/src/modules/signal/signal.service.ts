import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { Signal } from './signal.schema';

@Injectable()
export class SignalService extends BaseService<Signal> {
  constructor(
    @InjectModel(Signal.name) signalModel: Model<Signal>,
  ) {
    super(signalModel as any);
  }
}
