import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Extension, ExtensionSchema } from './extensions.schema';
import { ExtensionsService } from './extensions.service';
import { ExtensionsController } from './extensions.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Extension.name, schema: ExtensionSchema }]),
  ],
  controllers: [ExtensionsController],
  providers: [ExtensionsService],
  exports: [ExtensionsService],
})
export class ExtensionsModule {}
