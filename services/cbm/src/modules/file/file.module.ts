import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FileController, FileTestController } from './file.controller';
import { FileService } from './file.service';
import { FileEntity, FileEntitySchema } from './file.schema';
import { StorageSharedModule } from '../storage-shared/storage-shared.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FileEntity.name, schema: FileEntitySchema }]),
    MulterModule.register({ storage: memoryStorage() }),
    StorageSharedModule,
  ],
  controllers: [FileTestController, FileController],
  providers: [FileService],
  exports: [FileService, MongooseModule],
})
export class FileModule {}
