import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { PhoneNumber } from './phone-numbers.schema';

@Injectable()
export class PhoneNumbersService extends BaseService<PhoneNumber> {
  constructor(@InjectModel(PhoneNumber.name) model: Model<PhoneNumber>) {
    super(model);
  }

  /** Find phone number by E.164 number string */
  async findByNumber(number: string): Promise<Partial<PhoneNumber>> {
    const doc = await this.model.findOne({ number, isDeleted: false }).lean();
    if (!doc) throw new NotFoundException(`Phone number ${number} not found`);
    return doc;
  }
}
