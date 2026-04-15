/**
 * Entry point for the Realtime Collaboration server (cbm:rtc mode).
 *
 * Runs Hocuspocus as a standalone process bound to a dedicated port so it
 * does not contend with cbm:api's HTTP request handling. Hocuspocus keeps
 * per-document Y.Doc state in memory, so this process must run as a single
 * replica until we add sticky-session routing or the Hocuspocus Redis
 * extension (see docs/cbm/document/realtime-collab-PLAN.md §11).
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Server } from '@hocuspocus/server';
import { RtcModule } from './rtc.module';
import { buildHocuspocusHooks } from './modules/document-rtc/hocuspocus.hooks';

export async function bootstrapRtc() {
  const app = await NestFactory.createApplicationContext(RtcModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });

  const hooks = buildHocuspocusHooks(app);

  const port = parseInt(process.env.CBM_RTC_PORT || '3014', 10);
  const address = process.env.CBM_RTC_HOST || '0.0.0.0';

  const hocuspocus = new Server({
    port,
    address,
    // `onAuthenticate` populates the per-connection context used by the other
    // hooks. Throwing from here rejects the handshake.
    onAuthenticate: hooks.onAuthenticate as any,
    onLoadDocument: hooks.onLoadDocument as any,
    onStoreDocument: hooks.onStoreDocument as any,
    onDisconnect: hooks.onDisconnect as any,
  });

  await hocuspocus.listen();

  Logger.log(
    `🟢 CBM Realtime Collaboration (Hocuspocus) listening on ws://${address}:${port}`,
    'RtcServer',
  );

  const shutdown = async (signal: string) => {
    Logger.log(`${signal} received, shutting down RTC server...`, 'RtcServer');
    try {
      await hocuspocus.destroy();
    } catch (err: any) {
      Logger.warn(`hocuspocus.destroy() error: ${err.message}`, 'RtcServer');
    }
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  bootstrapRtc().catch((err) => {
    Logger.error(`RTC server failed to start: ${err.message}`, err.stack, 'RtcServer');
    process.exit(1);
  });
}
