import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TechnicalIndicatorController } from './technical-indicator.controller';
import { TechnicalIndicatorService } from './technical-indicator.service';
import { TechnicalIndicator, TechnicalIndicatorSchema } from './technical-indicator.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: TechnicalIndicator.name, schema: TechnicalIndicatorSchema }]),
  ],
  controllers: [TechnicalIndicatorController],
  providers: [TechnicalIndicatorService],
  exports: [TechnicalIndicatorService, MongooseModule],
})
export class TechnicalIndicatorModule {}
