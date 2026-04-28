import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PhoneNumber, PhoneNumberSchema } from './phone-numbers.schema';
import { PhoneNumbersService } from './phone-numbers.service';
import { PhoneNumbersController } from './phone-numbers.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: PhoneNumber.name, schema: PhoneNumberSchema }])],
  providers: [PhoneNumbersService],
  controllers: [PhoneNumbersController],
  exports: [PhoneNumbersService],
})
export class PhoneNumbersModule {}
