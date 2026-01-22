import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import {
  HealthModule,
  JwtStrategy,
  CorrelationIdMiddleware,
} from '@hydrabyte/base';
import { COMMON_CONFIG, SERVICE_CONFIG } from '@hydrabyte/shared';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DocumentModule } from '../modules/document/document.module';
import { ContentModule } from '../modules/content/content.module';
import { ProjectModule } from '../modules/project/project.module';
import { WorkModule } from '../modules/work/work.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(`${process.env.MONGODB_URI}/${COMMON_CONFIG.DatabaseNamePrefix}${SERVICE_CONFIG.cbm.name}`),
    PassportModule,
    HealthModule,
    DocumentModule,
    ContentModule,
    ProjectModule,
    WorkModule,
  ],
  controllers: [AppController],
  providers: [AppService, JwtStrategy],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply correlation ID middleware to all routes
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
