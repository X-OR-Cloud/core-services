import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  HealthModule,
  LicenseGuard,
  JwtStrategy,
  CorrelationIdMiddleware,
} from '@hydrabyte/base';
import { COMMON_CONFIG, SERVICE_CONFIG, buildMongoUri } from '@hydrabyte/shared';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MetricsModule } from '../modules/metrics/metrics.module';
import { QueueModule } from '../queues/queue.module';
import { ProcessorsModule } from '../queues/processors.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(
      buildMongoUri(`${COMMON_CONFIG.DatabaseNamePrefix}${SERVICE_CONFIG.mona.name}`)
    ),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // Default: 60 seconds
        limit: 10, // Default: 10 requests
      },
    ]),
    PassportModule,
    HealthModule,
    QueueModule,
    MetricsModule,
    ProcessorsModule,
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
