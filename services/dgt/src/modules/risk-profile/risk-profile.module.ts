import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RiskProfileController } from './risk-profile.controller';
import { RiskProfileService } from './risk-profile.service';
import { RiskProfile, RiskProfileSchema } from './risk-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: RiskProfile.name, schema: RiskProfileSchema }]),
  ],
  controllers: [RiskProfileController],
  providers: [RiskProfileService],
  exports: [RiskProfileService, MongooseModule],
})
export class RiskProfileModule {}
