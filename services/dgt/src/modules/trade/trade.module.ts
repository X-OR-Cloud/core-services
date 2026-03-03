import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TradeController } from './trade.controller';
import { TradeService } from './trade.service';
import { Trade, TradeSchema } from './trade.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Trade.name, schema: TradeSchema }]),
  ],
  controllers: [TradeController],
  providers: [TradeService],
  exports: [TradeService, MongooseModule],
})
export class TradeModule {}
