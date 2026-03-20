import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../configuration/configuration.module';
import { FileService } from './file.service';
import { FileController } from './file.controller';

@Module({
  imports: [ConfigurationModule],
  controllers: [FileController],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}
