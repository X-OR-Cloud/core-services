import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { Document, DocumentSchema } from './document.schema';
import { ProjectModule } from '../project/project.module';
import { FileModule } from '../file/file.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Document.name, schema: DocumentSchema }]),
    MulterModule.register({ storage: memoryStorage() }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'R4md0m_S3cr3t',
      }),
    }),
    ProjectModule,
    FileModule,
  ],
  controllers: [DocumentController],
  providers: [DocumentService],
  exports: [DocumentService, MongooseModule],
})
export class DocumentModule {}
