import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TradeController } from './trade.controller';
import { TradeService } from './trade.service';
import { TradeExecutionService } from './trade-execution.service';
import { Trade, TradeSchema } from './trade.schema';
import { OrderModule } from '../order/order.module';
import { PositionModule } from '../position/position.module';
import { AccountModule } from '../account/account.module';
import { SignalModule } from '../signal/signal.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Trade.name, schema: TradeSchema }]),
    OrderModule,
    PositionModule,
    AccountModule,
    SignalModule,
  ],
  controllers: [TradeController],
  providers: [TradeService, TradeExecutionService],
  exports: [TradeService, TradeExecutionService, MongooseModule],
})
export class TradeModule {}
