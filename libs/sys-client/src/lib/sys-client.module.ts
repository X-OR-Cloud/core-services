import { DynamicModule, Module } from '@nestjs/common';
import { buildMetrics } from './sys-client.metrics';
import {
  SysSettingClient,
  SYS_CLIENT_METRICS,
  SYS_CLIENT_OPTIONS,
} from './sys-setting-client.service';
import { SysClientOptions } from './sys-client.types';

/**
 * SysClientModule
 *
 * Service consumers register via:
 *
 *   SysClientModule.forRoot({
 *     sysApiUrl: process.env.SYS_API_URL!,
 *     internalApiKey: process.env.INTERNAL_API_KEY!,
 *     serviceName: process.env.SERVICE_NAME!,
 *     mongoUri: process.env.MONGODB_URI!,
 *     redisUrl: process.env.REDIS_URL,
 *     metricsEnabled: process.env.SYS_CLIENT_METRICS_ENABLED === 'true',
 *   })
 *
 * Then inject `SysSettingClient` to read settings.
 *
 * Ref: docs/sys/PROPOSAL.md §6
 */
@Module({})
export class SysClientModule {
  static forRoot(options: SysClientOptions): DynamicModule {
    return {
      module: SysClientModule,
      global: true,
      providers: [
        { provide: SYS_CLIENT_OPTIONS, useValue: options },
        {
          provide: SYS_CLIENT_METRICS,
          useFactory: () => (options.metricsEnabled ? buildMetrics() : null),
        },
        SysSettingClient,
      ],
      exports: [SysSettingClient],
    };
  }
}
