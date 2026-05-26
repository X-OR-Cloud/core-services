import { Logger } from '@nestjs/common';
import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';
import type { Socket } from 'socket.io';

export interface VoiceSessionConfig {
  apiKey: string;
  modelIdentifier: string;
  systemInstruction: string;
  tools: any[];
}

export class VoiceSession {
  private readonly logger = new Logger(VoiceSession.name);
  private session: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
  private closed = false;

  constructor(
    private readonly socket: Socket,
    private readonly config: VoiceSessionConfig,
  ) {}

  async init(): Promise<void> {
    this.logger.log(`[${this.socket.id}] init: model=${this.config.modelIdentifier} tools=${this.config.tools.length > 0 ? JSON.stringify(this.config.tools) : 'none'}`);
    const ai = new GoogleGenAI({ apiKey: this.config.apiKey });

    this.session = await ai.live.connect({
      model: this.config.modelIdentifier,
      callbacks: {
        onmessage: (msg: LiveServerMessage) => this.onGeminiMessage(msg),
        onerror: (err: ErrorEvent) => {
          this.logger.error(`[${this.socket.id}] Gemini error: ${err.message} | type=${err.type} | full=${JSON.stringify(err)}`);
          this.socket.emit('error', { message: 'Gemini Live connection error' });
        },
        onclose: (evt: CloseEvent) => {
          if (!this.closed) {
            this.logger.warn(`[${this.socket.id}] Gemini closed unexpectedly: code=${evt.code} reason=${evt.reason || '(none)'}`);
            this.socket.emit('error', { message: 'Gemini Live session closed' });
          }
        },
      },
      config: {
        systemInstruction: this.config.systemInstruction,
        tools: this.config.tools.length > 0
          ? [{ functionDeclarations: this.config.tools }]
          : undefined,
        responseModalities: [Modality.AUDIO],
      },
    });
  }

  sendAudio(base64Pcm: string): void {
    if (!this.session) return;
    this.session.sendRealtimeInput({
      audio: { data: base64Pcm, mimeType: 'audio/pcm;rate=16000' },
    });
  }

  sendToolResult(callId: string, name: string, result: unknown): void {
    if (!this.session) return;
    this.logger.log(`[${this.socket.id}] sendToolResult: callId=${callId} name=${name} result=${JSON.stringify(result)}`);
    this.session.sendToolResponse({
      functionResponses: [{ id: callId, name, response: { output: result } }],
    });
  }

  interrupt(): void {
    if (!this.session) return;
    // Signal end of audio turn to interrupt model generation
    this.session.sendRealtimeInput({ audioStreamEnd: true });
  }

  close(): void {
    this.closed = true;
    try {
      this.session?.close();
    } catch {
      // ignore close errors
    }
    this.session = null;
  }

  private onGeminiMessage(msg: LiveServerMessage): void {
    this.logger.debug(`[${this.socket.id}] gemini msg keys: ${Object.keys(msg).join(',')}`);

    if (msg.setupComplete) {
      this.logger.log(`[${this.socket.id}] setup complete`);
      this.socket.emit('ready');
      return;
    }

    if (msg.serverContent?.modelTurn?.parts) {
      for (const part of msg.serverContent.modelTurn.parts) {
        if (part.inlineData?.data) {
          this.socket.emit('audio', { data: part.inlineData.data });
        }
        if (part.text) {
          this.socket.emit('transcript', { text: part.text, role: 'assistant' });
        }
      }
    }

    if (msg.serverContent?.turnComplete) {
      this.logger.log(`[${this.socket.id}] turn complete`);
      this.socket.emit('turn_complete');
    }

    if (msg.toolCall?.functionCalls) {
      for (const call of msg.toolCall.functionCalls) {
        this.logger.log(`[${this.socket.id}] tool_call: id=${call.id} name=${call.name} args=${JSON.stringify(call.args)}`);
        this.socket.emit('tool_call', {
          callId: call.id,
          name: call.name,
          args: call.args ?? {},
        });
      }
    }

    if (msg.toolCallCancellation) {
      this.logger.warn(`[${this.socket.id}] tool_call_cancellation: ${JSON.stringify(msg.toolCallCancellation)}`);
    }
  }
}
