import { Module } from '@nestjs/common';
import { HoaLuModule } from './hoa-lu-resort/hoa-lu.module';

@Module({
  imports: [
    HoaLuModule,
    // Add new customer modules here
  ],
})
export class CustomModule {}
