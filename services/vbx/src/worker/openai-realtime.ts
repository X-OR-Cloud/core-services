/**
 * OpenAI Realtime API connector via WebSocket
 * Ported from P001-voip-callbot/src/lib/openai-realtime.js
 */

import { Logger } from '@nestjs/common';
import WebSocket from 'ws';
import { v4 as uuid } from 'uuid';
import { ulawToSlin16 } from './audio-convert';
import { AudioPacer } from './audio-pacer';

const logger = new Logger('OpenAIRealtime');

export interface TranscriptEntry {
  role: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

export interface OpenAISessionConfig {
  apiKey: string;
  model: string;
  voice: string;
  systemPrompt: string;
  temperature?: number;
  vadThreshold?: number;
  vadSilenceDurationMs?: number;
  vadPrefixPaddingMs?: number;
  initialMessage?: string;
  callerNumber?: string;
  callerName?: string;
}

export interface OpenAISession {
  ws: WebSocket | null;
  pacer: AudioPacer | null;
  transcript: TranscriptEntry[];
  answeredAt: Date | null;
  closed: boolean;
  cleanup: () => void;
}

/**
 * Start an OpenAI Realtime session for a call.
 * Returns session object with ws, transcript, and cleanup.
 */
export function startOpenAISession(
  sessionId: string,
  config: OpenAISessionConfig,
  socket: import('net').Socket,
  onClose?: () => void,
): Promise<OpenAISession> {
  return new Promise((resolve, reject) => {
    const transcript: TranscriptEntry[] = [];
    const pacer = new AudioPacer(socket);
    let hasGreeted = false;
    let wsClosed = false;

    const realtimeUrl = `wss://api.openai.com/v1/realtime?model=${config.model}`;

    const ws = new WebSocket(realtimeUrl, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    const session: OpenAISession = {
      ws,
      pacer,
      transcript,
      answeredAt: null,
      closed: false,
      cleanup: () => {
        session.closed = true;
        pacer.destroy();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      },
    };

    ws.on('open', () => {
      logger.log(`${sessionId} WebSocket connected to OpenAI`);
      session.answeredAt = new Date();

      // Configure session
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['audio', 'text'],
          voice: config.voice,
          instructions: config.systemPrompt,
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          input_audio_transcription: { model: 'whisper-1' },
          turn_detection: {
            type: 'server_vad',
            threshold: config.vadThreshold ?? 0.5,
            prefix_padding_ms: config.vadPrefixPaddingMs ?? 300,
            silence_duration_ms: config.vadSilenceDurationMs ?? 500,
          },
          temperature: config.temperature ?? 0.8,
        },
      }));

      // Send initial greeting message
      let initialMsg = config.initialMessage || 'Có cuộc gọi đến. Hãy chào khách hàng.';
      if (config.callerName) {
        initialMsg = `Khách hàng gọi đến là ${config.callerName} (số ${config.callerNumber}). Hãy chào họ bằng tên.`;
      } else if (config.callerNumber) {
        initialMsg = `Có cuộc gọi đến từ số ${config.callerNumber}. ${initialMsg}`;
      }

      const itemId = uuid().replace(/-/g, '').substring(0, 32);
      ws.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          id: itemId,
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: initialMsg }],
        },
      }));

      ws.send(JSON.stringify({
        type: 'response.create',
        response: { modalities: ['audio', 'text'] },
      }));

      resolve(session);
    });

    ws.on('message', (data) => {
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case 'conversation.item.created':
          if (msg.item?.role === 'user' && hasGreeted) {
            // Barge-in: user interrupted AI
            pacer.flush();
          }
          break;

        case 'response.audio.delta':
          if (msg.delta) {
            const ulawBuf = Buffer.from(msg.delta, 'base64');
            if (ulawBuf.length > 0 && !ulawBuf.every((b: number) => b === 0x7F)) {
              const slin16Buf = ulawToSlin16(ulawBuf);
              pacer.enqueue(slin16Buf);
            }
          }
          break;

        case 'response.audio_transcript.done':
          hasGreeted = true;
          if (msg.transcript) {
            logger.debug(`${sessionId} AI: ${msg.transcript}`);
            transcript.push({ role: 'ai', text: msg.transcript, timestamp: new Date() });
          }
          break;

        case 'conversation.item.input_audio_transcription.completed':
          if (msg.transcript) {
            logger.debug(`${sessionId} User: ${msg.transcript}`);
            transcript.push({ role: 'user', text: msg.transcript, timestamp: new Date() });
          }
          break;

        case 'error':
          logger.error(`${sessionId} OpenAI error: ${JSON.stringify(msg.error)}`);
          break;

        default:
          break;
      }
    });

    ws.on('close', () => {
      logger.log(`${sessionId} OpenAI WebSocket closed`);
      wsClosed = true;
      session.ws = null;
      session.closed = true;
      pacer.destroy();
      onClose?.();
    });

    ws.on('error', (err) => {
      logger.error(`${sessionId} OpenAI WS error: ${err.message}`);
      if (!session.answeredAt) {
        reject(new Error(`OpenAI connection failed: ${err.message}`));
      }
    });
  });
}
