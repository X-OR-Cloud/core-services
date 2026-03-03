import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RiskProfile } from './risk-profile.schema';

@Injectable()
export class RiskProfileService extends BaseService<RiskProfile> {
  constructor(
    @InjectModel(RiskProfile.name) riskProfileModel: Model<RiskProfile>,
  ) {
    super(riskProfileModel as any);
  }
}
