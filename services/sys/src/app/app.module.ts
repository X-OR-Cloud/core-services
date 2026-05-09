import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { HealthModule, JwtStrategy, CorrelationIdMiddleware } from '@hydrabyte/base';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SettingModule } from '../modules/setting/setting.module';
import { AuditLogModule } from '../modules/audit-log/audit-log.module';

/**
 * API mode module — HTTP server for SYS service.
 * Worker mode (BullMQ audit-ingest processor) lives in app-worker.module.ts.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRoot(
      process.env['MONGODB_URI'] || 'mongodb://localhost:27017',
      { dbName: 'core-sys' },
    ),
    PassportModule,
    HealthModule,
    SettingModule,
    AuditLogModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService, JwtStrategy],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
