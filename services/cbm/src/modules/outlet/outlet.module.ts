import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OutletController } from './outlet.controller';
import { OutletService } from './outlet.service';
import { Outlet, OutletSchema } from './outlet.schema';
import { OutletMemberModule } from '../outlet-member/outlet-member.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Outlet.name, schema: OutletSchema }]),
    OutletMemberModule,
  ],
  controllers: [OutletController],
  providers: [OutletService],
  exports: [OutletService, MongooseModule],
})
export class OutletModule {}
