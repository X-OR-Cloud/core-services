import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OutletMemberController } from './outlet-member.controller';
import { OutletMemberService } from './outlet-member.service';
import { OutletMember, OutletMemberSchema } from './outlet-member.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: OutletMember.name, schema: OutletMemberSchema }]),
  ],
  controllers: [OutletMemberController],
  providers: [OutletMemberService],
  exports: [OutletMemberService, MongooseModule],
})
export class OutletMemberModule {}
