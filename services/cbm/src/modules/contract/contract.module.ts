import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContractController } from './contract.controller';
import { ContractService } from './contract.service';
import { Contract, ContractSchema } from './contract.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Contract.name, schema: ContractSchema }]),
  ],
  controllers: [ContractController],
  providers: [ContractService],
  exports: [ContractService, MongooseModule],
})
export class ContractModule {}
