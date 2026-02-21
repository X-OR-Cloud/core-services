/**
 * VBX Worker Entrypoint — AudioSocket TCP server + OpenAI Realtime
 * No HTTP server. Receives calls from Asterisk via AudioSocket.
 *
 * Usage: WORKER_ID=1 node dist/services/vbx/worker.main.js
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './app/worker.module';
import { ExtensionsService } from './modules/extensions/extensions.service';
import { CallsService } from './modules/calls/calls.service';
import { startAudioSocketServer } from './worker/audiosocket.server';

async function bootstrap() {
  const app = await NestFactory.create(WorkerModule);
  await app.init();

  const workerId = process.env['WORKER_ID'] || '1';
  const audioSocketPort = parseInt(process.env['AUDIOSOCKET_PORT'] || '12000', 10);

  // Get services from DI container
  const extensionsService = app.get(ExtensionsService);
  const callsService = app.get(CallsService);

  // Start AudioSocket TCP server
  startAudioSocketServer(extensionsService, callsService, audioSocketPort);

  Logger.log(`🔧 VBX Worker #${workerId} started`);
  Logger.log(`🎧 AudioSocket TCP on port ${audioSocketPort}`);
  Logger.log(`📊 MongoDB: ${process.env['MONGODB_URI']}/hydra_vbx`);
}

bootstrap();
