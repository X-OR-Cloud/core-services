import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Configuration,
  ConfigurationSchema,
} from './configuration.schema';
import { ConfigurationService } from './configuration.service';
import { ConfigurationController } from './configuration.controller';
import { ConfigService } from './config.service';
import { IamOrgService } from './iam-org.service';

/**
 * Configuration Module
 *
 * Manages system configuration key-value pairs.
 * V2: Simplified design with 23 predefined config keys.
 *
 * Exports:
 * - ConfigurationService: For CRUD operations (admin)
 * - ConfigService: For internal consumption (services)
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Configuration.name, schema: ConfigurationSchema },
    ]),
  ],
  providers: [ConfigurationService, ConfigService, IamOrgService],
  controllers: [ConfigurationController],
  exports: [ConfigurationService, ConfigService],
})
export class ConfigurationModule {}
