import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { SERVICE_CONFIG, COMMON_CONFIG, buildMongoUri } from '@hydrabyte/shared';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { HealthModule, LicenseGuard, JwtStrategy, CorrelationIdMiddleware } from '@hydrabyte/base';
import { SysClientModule } from '@hydrabyte/sys-client';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OrganizationsModule } from './modules/organization/organization.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/user/user.module';
import { LicenseModule } from './modules/license/license.module';
import { IamAppModule } from './modules/app/app.module';
import { SetupModule } from './modules/setup/setup.module';
import { ServiceAccountModule } from './modules/service-account/service-account.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(buildMongoUri(`${COMMON_CONFIG.DatabaseNamePrefix}${SERVICE_CONFIG.iam.name}`)),
    SysClientModule.forRoot({
      sysApiUrl: process.env['SYS_API_URL'] || 'http://localhost:3007',
      internalApiKey: process.env['INTERNAL_API_KEY'] || '',
      serviceName: 'iam',
      mongoUri: process.env['MONGODB_URI'] || 'mongodb://localhost:27017',
      redisUrl: process.env['REDIS_URL'],
      redisHost: process.env['REDIS_HOST'],
      redisPort: process.env['REDIS_PORT'] ? parseInt(process.env['REDIS_PORT'], 10) : undefined,
      redisUsername: process.env['REDIS_USERNAME'],
      redisPassword: process.env['REDIS_PASSWORD'],
      metricsEnabled: process.env['SYS_CLIENT_METRICS_ENABLED'] === 'true',
    }),
    PassportModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    LicenseModule,
    IamAppModule,
    SetupModule,
    ServiceAccountModule,
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
