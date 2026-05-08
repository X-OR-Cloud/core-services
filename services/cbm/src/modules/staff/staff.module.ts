import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [ConfigModule],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
