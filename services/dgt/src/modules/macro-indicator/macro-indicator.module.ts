import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MacroIndicatorController } from './macro-indicator.controller';
import { MacroIndicatorService } from './macro-indicator.service';
import { MacroIndicator, MacroIndicatorSchema } from './macro-indicator.schema';
import { FredCollector } from '../../collectors/fred.collector';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MacroIndicator.name, schema: MacroIndicatorSchema }]),
  ],
  controllers: [MacroIndicatorController],
  providers: [MacroIndicatorService, FredCollector],
  exports: [MacroIndicatorService, MongooseModule],
})
export class MacroIndicatorModule {}
