import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SharedDataService } from '../../shared/shared-data.service';
import { MacroIndicator } from './macro-indicator.schema';

@Injectable()
export class MacroIndicatorService extends SharedDataService<MacroIndicator> {
  constructor(
    @InjectModel(MacroIndicator.name) model: Model<MacroIndicator>,
  ) {
    super(model);
  }
}
