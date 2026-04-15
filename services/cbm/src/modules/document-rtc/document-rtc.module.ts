import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Document, DocumentSchema } from '../document/document.schema';
import { DocumentRtcService } from './document-rtc.service';

/**
 * DocumentRtcModule — isolated module exposing DocumentRtcService so it can be
 * consumed from both cbm:api (for session checks + commit) and cbm:rtc (for
 * Hocuspocus hooks). Keeps DB schema registration local so bootstrapping
 * cbm:rtc does not need to import the full DocumentModule (which drags in the
 * FileModule / ProjectModule dependency graph).
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Document.name, schema: DocumentSchema }]),
  ],
  providers: [DocumentRtcService],
  exports: [DocumentRtcService, MongooseModule],
})
export class DocumentRtcModule {}
