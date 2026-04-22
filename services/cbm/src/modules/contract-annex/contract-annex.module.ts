import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContractAnnexController } from './contract-annex.controller';
import { ContractAnnexService } from './contract-annex.service';
import { ContractAnnex, ContractAnnexSchema } from './contract-annex.schema';
import { ContractModule } from '../contract/contract.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ContractAnnex.name, schema: ContractAnnexSchema }]),
    ContractModule, // provides ContractService for validation
  ],
  controllers: [ContractAnnexController],
  providers: [ContractAnnexService],
  exports: [ContractAnnexService, MongooseModule],
})
export class ContractAnnexModule {}
