import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MacroIndicatorController } from './macro-indicator.controller';
import { MacroIndicatorService } from './macro-indicator.service';
import { MacroIndicator, MacroIndicatorSchema } from './macro-indicator.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MacroIndicator.name, schema: MacroIndicatorSchema }]),
  ],
  controllers: [MacroIndicatorController],
  providers: [MacroIndicatorService],
  exports: [MacroIndicatorService, MongooseModule],
})
export class MacroIndicatorModule {}
