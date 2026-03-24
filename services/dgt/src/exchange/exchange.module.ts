import { Module } from '@nestjs/common';
import { ExchangeAdapterFactory } from './exchange-adapter.factory';

@Module({
  providers: [ExchangeAdapterFactory],
  exports: [ExchangeAdapterFactory],
})
export class ExchangeModule {}
