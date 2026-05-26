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
    const ai = new GoogleGenAI({ apiKey: this.config.apiKey });

    this.session = await ai.live.connect({
      model: this.config.modelIdentifier,
      callbacks: {
        onmessage: (msg: LiveServerMessage) => this.onGeminiMessage(msg),
        onerror: (err: ErrorEvent) => {
          this.logger.error(`Gemini Live error: ${err.message}`);
          this.socket.emit('error', { message: 'Gemini Live connection error' });
        },
        onclose: () => {
          if (!this.closed) {
            this.logger.warn(`Gemini Live closed unexpectedly for socket ${this.socket.id}`);
            this.socket.emit('error', { message: 'Gemini Live session closed' });
          }
        },
      },
      config: {
        systemInstruction: this.config.systemInstruction,
        tools: this.config.tools.length > 0 ? this.config.tools : undefined,
        // toolConfig not yet typed in SDK v1.41.0 but supported by Gemini Live API
        ...(this.config.tools.length > 0 && {
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        } as any),
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

  sendToolResult(callId: string, result: unknown): void {
    if (!this.session) return;
    this.session.sendToolResponse({
      functionResponses: [{ id: callId, response: { output: result } }],
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
    if (msg.setupComplete) {
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
      this.socket.emit('turn_complete');
    }

    if (msg.toolCall?.functionCalls) {
      for (const call of msg.toolCall.functionCalls) {
        this.socket.emit('tool_call', {
          callId: call.id,
          name: call.name,
          args: call.args ?? {},
        });
      }
    }
  }
}
