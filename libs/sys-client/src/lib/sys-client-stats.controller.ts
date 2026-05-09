import {
  Controller,
  Get,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SysSettingClient } from './sys-setting-client.service';
import { SysCacheStats } from './sys-client.types';

/**
 * Optional debug controller. Register manually if you want a `/sys-client/stats`
 * endpoint exposed in your service:
 *
 *   @Module({
 *     imports: [SysClientModule.forRoot({ ... })],
 *     controllers: [SysClientStatsController],
 *   })
 *
 * Auth: requires either DEBUG=true or a valid INTERNAL_API_KEY header.
 *
 * Output is masked (Safety Guard #5): no value, sensitive entries indistinguishable
 * from non-sensitive in shape.
 *
 * Ref: docs/sys/PROPOSAL.md §6.4 #5, §8.3
 */
@ApiExcludeController()
@Controller('sys-client')
export class SysClientStatsController {
  constructor(private readonly client: SysSettingClient) {}

  @Get('stats')
  getStats(@Headers('x-internal-api-key') apiKey?: string): SysCacheStats {
    const debugMode = process.env['DEBUG'] === 'true';
    const expected = process.env['INTERNAL_API_KEY'];
    if (!debugMode && (!expected || apiKey !== expected)) {
      throw new UnauthorizedException();
    }
    return this.client.getCacheStats();
  }
}
