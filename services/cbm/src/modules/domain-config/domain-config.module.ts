import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DomainConfigController } from './domain-config.controller';
import { DomainConfigService } from './domain-config.service';
import { DomainConfig, DomainConfigSchema } from './domain-config.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: DomainConfig.name, schema: DomainConfigSchema }]),
  ],
  controllers: [DomainConfigController],
  providers: [DomainConfigService],
  exports: [DomainConfigService],
})
export class DomainConfigModule {}
