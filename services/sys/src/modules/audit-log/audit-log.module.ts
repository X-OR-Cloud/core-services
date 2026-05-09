import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { AuditLog, AuditLogSchema } from './audit-log.schema';
import { AuditLogService } from './audit-log.service';
import { AuditLogController, AuditLogInternalController } from './audit-log.controller';
import { AuditLogProcessor } from './audit-log.processor';
import { SYS_AUDIT_INGEST_QUEUE } from './audit-log.constants';

/**
 * Audit-log Module
 *
 * Two registration variants:
 *  - `forRoot()`        — API mode: schema + service + UI controller. No BullMQ worker.
 *  - `forRootWorker()`  — Worker mode: schema + service + processor.
 *
 * Ref: docs/sys/PLAN_v1.md Phase P2
 */
@Module({})
export class AuditLogModule {
  /** API mode (default). UI controller + internal ingest endpoint. */
  static forRoot(): DynamicModule {
    return {
      module: AuditLogModule,
      imports: [
        MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }]),
      ],
      controllers: [AuditLogController, AuditLogInternalController],
      providers: [AuditLogService],
      exports: [AuditLogService],
    };
  }

  /** Worker mode. Registers processor + BullMQ queue connection. */
  static forRootWorker(): DynamicModule {
    return {
      module: AuditLogModule,
      imports: [
        MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }]),
        BullModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService) => {
            const url = configService.get<string>('REDIS_URL');
            if (url) {
              return { connection: { url } } as any;
            }
            return {
              connection: {
                host: configService.get<string>('REDIS_HOST') || 'localhost',
                port: parseInt(configService.get<string>('REDIS_PORT') || '6379', 10),
                username: configService.get<string>('REDIS_USERNAME') || undefined,
                password: configService.get<string>('REDIS_PASSWORD') || undefined,
              },
            };
          },
          inject: [ConfigService],
        }),
        BullModule.registerQueue({ name: SYS_AUDIT_INGEST_QUEUE }),
      ],
      providers: [AuditLogService, AuditLogProcessor],
      exports: [AuditLogService],
    };
  }
}
