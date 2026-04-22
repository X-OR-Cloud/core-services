import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import {
  HealthModule,
  LicenseGuard,
  JwtStrategy,
  CorrelationIdMiddleware,
} from '@hydrabyte/base';
import { COMMON_CONFIG, SERVICE_CONFIG, buildMongoUri } from '@hydrabyte/shared';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DocumentModule } from '../modules/document/document.module';
import { ContentModule } from '../modules/content/content.module';
import { ProjectModule } from '../modules/project/project.module';
import { WorkModule } from '../modules/work/work.module';
import { KnowledgeCollectionModule } from '../modules/knowledge-collection/knowledge-collection.module';
import { FileModule } from '../modules/file/file.module';
import { StorageSharedModule } from '../modules/storage-shared/storage-shared.module';
import { KnowledgeChunkModule } from '../modules/knowledge-chunk/knowledge-chunk.module';
import { CompanyModule } from '../modules/company/company.module';
import { ContactModule } from '../modules/contact/contact.module';
import { InteractionModule } from '../modules/interaction/interaction.module';
import { InvoiceModule } from '../modules/invoice/invoice.module';
import { ExpenseModule } from '../modules/expense/expense.module';
import { PaymentModule } from '../modules/payment/payment.module';
import { TransactionModule } from '../modules/transaction/transaction.module';
import { ContractModule } from '../modules/contract/contract.module';
import { ContractAnnexModule } from '../modules/contract-annex/contract-annex.module';
import { SkillModule } from '../skill/skill.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(buildMongoUri(`${COMMON_CONFIG.DatabaseNamePrefix}${SERVICE_CONFIG.cbm.name}`)),
    PassportModule,
    HealthModule,
    DocumentModule,
    ContentModule,
    ProjectModule,
    WorkModule,
    StorageSharedModule,
    FileModule,
    KnowledgeCollectionModule,
    KnowledgeChunkModule,
    // CRM modules
    CompanyModule,
    ContactModule,
    InteractionModule,
    // Finance modules
    TransactionModule,
    InvoiceModule,
    ExpenseModule,
    PaymentModule,
    // Contract modules (CRM)
    ContractModule,
    ContractAnnexModule,
    // Skill manifest endpoint
    SkillModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: LicenseGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply correlation ID middleware to all routes
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
