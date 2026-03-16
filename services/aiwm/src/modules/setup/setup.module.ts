import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Configuration, ConfigurationSchema } from '../configuration/configuration.schema';
import { ConfigurationModule } from '../configuration/configuration.module';
import { SetupService } from './setup.service';
import { SetupController } from './setup.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Configuration.name, schema: ConfigurationSchema },
    ]),
    ConfigurationModule,
  ],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
