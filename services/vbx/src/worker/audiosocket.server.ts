/**
 * AudioSocket TCP server — receives calls from Asterisk, bridges to OpenAI Realtime
 * Ported from P001-voip-callbot/src/lib/audiosocket-server.js
 */

import * as net from 'net';
import * as fs from 'fs';
import { Logger } from '@nestjs/common';
import { slin16ToUlaw } from './audio-convert';
import { startOpenAISession, OpenAISession, OpenAISessionConfig } from './openai-realtime';
import { ExtensionsService } from '../modules/extensions/extensions.service';
import { CallsService } from '../modules/calls/calls.service';
import { RequestContext } from '@hydrabyte/shared';

const logger = new Logger('AudioSocketServer');

const MSG_HANGUP = 0x00;
const MSG_UUID = 0x01;
const MSG_AUDIO = 0x10;
const MSG_ERROR = 0xFF;

const RECORDING_DIR = '/var/recordings/vbx';
const CALLED_NUMBER = '842471083656';

const systemContext: RequestContext = {
  orgId: '', groupId: '', userId: 'system',
  agentId: '', appId: '', roles: ['universe.owner' as any],
};

interface ActiveSession {
  socket: net.Socket;
  sessionId: string;
  callerNumber: string;
  callerName: string;
  extension: any;
  openaiSession: OpenAISession | null;
  startedAt: Date;
}

const activeSessions = new Map<string, ActiveSession>();

function parseMessages(buffer: Buffer): { messages: { type: number; payload: Buffer }[]; remainder: Buffer } {
  const messages: { type: number; payload: Buffer }[] = [];
  let offset = 0;

  while (offset + 3 <= buffer.length) {
    const type = buffer[offset];
    const length = buffer.readUInt16BE(offset + 1);
    if (offset + 3 + length > buffer.length) break;
    const payload = buffer.subarray(offset + 3, offset + 3 + length);
    messages.push({ type, payload });
    offset += 3 + length;
  }

  return { messages, remainder: buffer.subarray(offset) };
}

function readCallerInfo(sessionId: string): { number: string; name: string } {
  try {
    const infoFile = `/tmp/call-${sessionId}.info`;
    if (fs.existsSync(infoFile)) {
      const callerNum = fs.readFileSync(infoFile, 'utf-8').trim();
      return { number: callerNum, name: '' };
    }
  } catch (e) {
    logger.warn(`Error reading caller info for ${sessionId}`);
  }
  return { number: 'unknown', name: '' };
}

function sendHangup(socket: net.Socket): void {
  if (socket.destroyed) return;
  const msg = Buffer.alloc(3);
  msg[0] = MSG_HANGUP;
  msg.writeUInt16BE(0, 1);
  socket.write(msg);
}

export function startAudioSocketServer(
  extensionsService: ExtensionsService,
  callsService: CallsService,
  port = 12000,
): net.Server {
  // Ensure recording directory exists
  if (!fs.existsSync(RECORDING_DIR)) {
    fs.mkdirSync(RECORDING_DIR, { recursive: true });
  }

  const server = net.createServer((socket) => {
    let buffer: Buffer = Buffer.alloc(0);
    let session: ActiveSession | null = null;

    logger.log(`New connection from ${socket.remoteAddress}:${socket.remotePort}`);

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { messages, remainder } = parseMessages(buffer);
      buffer = remainder;

      for (const msg of messages) {
        switch (msg.type) {
          case MSG_UUID: {
            // Parse UUID
            let sessionId: string;
            if (msg.payload.length === 16) {
              const hex = msg.payload.toString('hex');
              sessionId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
            } else {
              sessionId = msg.payload.toString('utf8').trim();
            }

            logger.log(`Session UUID: ${sessionId}`);

            // Read caller info
            const callerInfo = readCallerInfo(sessionId);
            logger.log(`Caller: ${callerInfo.number}`);

            session = {
              socket,
              sessionId,
              callerNumber: callerInfo.number,
              callerName: callerInfo.name,
              extension: null,
              openaiSession: null,
              startedAt: new Date(),
            };
            activeSessions.set(sessionId, session);

            // Async: find extension and start AI
            handleNewCall(session, extensionsService, callsService).catch((err) => {
              logger.error(`${sessionId} setup error: ${err.message}`);
              sendHangup(socket);
              socket.destroy();
            });
            break;
          }

          case MSG_AUDIO: {
            if (!session?.openaiSession?.ws) break;
            const ws = session.openaiSession.ws;
            if (ws.readyState !== 1) break; // WebSocket.OPEN = 1

            // slin16 → ulaw → send to OpenAI
            const ulawBuf = slin16ToUlaw(msg.payload);
            ws.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: ulawBuf.toString('base64'),
            }));
            break;
          }

          case MSG_HANGUP: {
            logger.log(`${session?.sessionId || 'unknown'} hangup received`);
            if (session) {
              finishCall(session, callsService).catch(() => {});
            }
            break;
          }

          case MSG_ERROR: {
            logger.error(`${session?.sessionId || 'unknown'} Asterisk error: ${msg.payload.toString()}`);
            if (session) {
              finishCall(session, callsService).catch(() => {});
            }
            break;
          }
        }
      }
    });

    socket.on('close', () => {
      if (session) {
        logger.log(`${session.sessionId} connection closed`);
        finishCall(session, callsService).catch(() => {});
      }
    });

    socket.on('error', (err) => {
      logger.error(`${session?.sessionId || 'unknown'} socket error: ${err.message}`);
    });
  });

  server.listen(port, '0.0.0.0', () => {
    logger.log(`🎧 AudioSocket TCP server listening on 0.0.0.0:${port}`);
  });

  return server;
}

async function handleNewCall(
  session: ActiveSession,
  extensionsService: ExtensionsService,
  callsService: CallsService,
): Promise<void> {
  const { sessionId, callerNumber } = session;

  // 1. Find matching extension
  const extension = await extensionsService.findByCallerNumber(callerNumber);
  if (!extension) {
    logger.warn(`${sessionId} No extension matches caller ${callerNumber} — rejecting`);

    // Save rejected call
    await callsService.create({
      callId: sessionId,
      callerNumber,
      calledNumber: CALLED_NUMBER,
      direction: 'inbound',
      startedAt: session.startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      status: 'rejected',
      data: { reason: 'no_matching_extension' },
    }, systemContext);

    sendHangup(session.socket);
    session.socket.destroy();
    return;
  }

  session.extension = extension;
  logger.log(`${sessionId} Matched extension: ${extension.name} (${extension.number})`);

  // 2. Get AI config
  const ai = extension.ai || {};
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    logger.error(`${sessionId} OPENAI_API_KEY not configured`);
    sendHangup(session.socket);
    return;
  }

  // 3. Start OpenAI Realtime session
  const maxDuration = (ai.maxCallDurationSec || 300) * 1000;
  const durationTimeout = setTimeout(() => {
    logger.log(`${sessionId} Max duration reached (${ai.maxCallDurationSec || 300}s)`);
    sendHangup(session.socket);
    session.socket.destroy();
  }, maxDuration);

  try {
    const openaiSession = await startOpenAISession(
      sessionId,
      {
        apiKey,
        model: ai.model || 'gpt-4o-mini-realtime-preview-2024-12-17',
        voice: ai.voice || 'shimmer',
        systemPrompt: ai.systemPrompt || 'Bạn là trợ lý AI thân thiện.',
        temperature: ai.temperature,
        vadThreshold: ai.vad?.threshold,
        vadSilenceDurationMs: ai.vad?.silenceDurationMs,
        vadPrefixPaddingMs: ai.vad?.prefixPaddingMs,
        initialMessage: extension.initialMessage,
        callerNumber: session.callerNumber,
        callerName: session.callerName,
      },
      session.socket,
      () => {
        clearTimeout(durationTimeout);
      },
    );

    session.openaiSession = openaiSession;
    logger.log(`${sessionId} OpenAI session started — AI ready`);
  } catch (err) {
    logger.error(`${sessionId} Failed to start OpenAI: ${err.message}`);
    clearTimeout(durationTimeout);
    sendHangup(session.socket);
  }
}

async function finishCall(
  session: ActiveSession,
  callsService: CallsService,
): Promise<void> {
  const { sessionId } = session;

  // Prevent double-finish
  if (!activeSessions.has(sessionId)) return;
  activeSessions.delete(sessionId);

  const endedAt = new Date();
  const duration = Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000);
  const talkDuration = session.openaiSession?.answeredAt
    ? Math.round((endedAt.getTime() - session.openaiSession.answeredAt.getTime()) / 1000)
    : 0;

  // Cleanup OpenAI session
  if (session.openaiSession) {
    session.openaiSession.cleanup();
  }

  // Build recording path (Asterisk MixMonitor should save here)
  const recordingFile = `${sessionId}.wav`;
  const recordingPath = `${RECORDING_DIR}/${recordingFile}`;
  const hasRecording = fs.existsSync(recordingPath);

  // Save CDR
  try {
    await callsService.create({
      extensionId: session.extension ? (session.extension as any)._id.toString() : '',
      callId: sessionId,
      callerNumber: session.callerNumber,
      callerName: session.callerName,
      calledNumber: CALLED_NUMBER,
      direction: 'inbound',
      startedAt: session.startedAt.toISOString(),
      answeredAt: session.openaiSession?.answeredAt?.toISOString(),
      endedAt: endedAt.toISOString(),
      duration,
      talkDuration,
      transcript: session.openaiSession?.transcript || [],
      recordingUrl: hasRecording ? recordingFile : '',
      status: session.openaiSession?.answeredAt ? 'answered' : 'missed',
      llmProvider: 'openai',
      llmModel: session.extension?.ai?.model || '',
    }, systemContext);

    logger.log(`${sessionId} CDR saved — duration: ${duration}s, transcript: ${session.openaiSession?.transcript?.length || 0} entries`);
  } catch (err) {
    logger.error(`${sessionId} Failed to save CDR: ${err.message}`);
  }

  // Cleanup caller info file
  try {
    const infoFile = `/tmp/call-${sessionId}.info`;
    if (fs.existsSync(infoFile)) fs.unlinkSync(infoFile);
  } catch {}
}
