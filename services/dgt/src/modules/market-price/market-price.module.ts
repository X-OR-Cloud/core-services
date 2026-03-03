import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MarketPriceController } from './market-price.controller';
import { MarketPriceService } from './market-price.service';
import { MarketPrice, MarketPriceSchema } from './market-price.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MarketPrice.name, schema: MarketPriceSchema }]),
  ],
  controllers: [MarketPriceController],
  providers: [MarketPriceService],
  exports: [MarketPriceService, MongooseModule],
})
export class MarketPriceModule {}
