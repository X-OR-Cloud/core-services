/**
 * VBX Combined Module - For local dev (API + Worker in one process)
 */
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthModule, CorrelationIdMiddleware } from '@hydrabyte/base';
import { ExtensionsModule } from '../modules/extensions/extensions.module';
import { CallsModule } from '../modules/calls/calls.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    MongooseModule.forRoot(
      process.env['MONGODB_URI'] || 'mongodb://localhost:27017',
      { dbName: 'hydra_vbx' },
    ),
    HealthModule,
    ExtensionsModule,
    CallsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
