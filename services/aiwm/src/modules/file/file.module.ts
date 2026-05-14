import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigurationModule } from '../configuration/configuration.module';
import { FileService } from './file.service';
import { FileController } from './file.controller';

@Module({
  imports: [ConfigurationModule, ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }])],
  controllers: [FileController],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}
