import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { PhoneNumber } from './phone-numbers.schema';

@Injectable()
export class PhoneNumbersService extends BaseService<PhoneNumber> {
  constructor(@InjectModel(PhoneNumber.name) model: Model<PhoneNumber>) {
    super(model);
  }
}
