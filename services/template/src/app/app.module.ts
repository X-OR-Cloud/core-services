import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { HealthModule, JwtStrategy, CorrelationIdMiddleware } from '@hydrabyte/base';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CategoryModule } from '../modules/category/category.module';
import { ProductModule } from '../modules/product/product.module';
import { ReportModule } from '../modules/report/report.module';
import { QueueModule } from '../queues/queue.module';

/**
 * API mode module — HTTP server + producers only.
 * Processors run in worker mode (app-worker.module.ts).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRoot(
      process.env['MONGODB_URI'] || 'mongodb://localhost:27017',
      { dbName: 'core_template' },
    ),
    PassportModule,
    HealthModule,
    QueueModule,
    CategoryModule,
    ProductModule,
    ReportModule,
  ],
  controllers: [AppController],
  providers: [AppService, JwtStrategy],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
