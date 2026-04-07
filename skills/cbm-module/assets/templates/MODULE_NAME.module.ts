import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MODULE_CLASSController } from './MODULE_NAME.controller';
import { MODULE_CLASSService } from './MODULE_NAME.service';
import { MODULE_CLASS, MODULE_CLASSSchema } from './MODULE_NAME.schema';
// import { OtherModule } from '../other/other.module'; // if cross-module dependency

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MODULE_CLASS.name, schema: MODULE_CLASSSchema }]),
    // OtherModule, // if needed
  ],
  controllers: [MODULE_CLASSController],
  providers: [MODULE_CLASSService],
  exports: [MODULE_CLASSService, MongooseModule],
})
export class MODULE_CLASSModule {}
