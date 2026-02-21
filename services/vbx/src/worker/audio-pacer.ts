/**
 * Audio Pacer — sends audio frames at 20ms intervals to avoid jitter
 * 8kHz slin16 = 160 samples = 320 bytes per 20ms frame
 */

import * as net from 'net';

const MSG_AUDIO = 0x10;
const FRAME_SIZE = 320; // bytes per 20ms @ 8kHz slin16
const FRAME_MS = 20;

export class AudioPacer {
  private queue = Buffer.alloc(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private playing = false;

  constructor(private socket: net.Socket) {}

  enqueue(slin16Buf: Buffer): void {
    this.queue = Buffer.concat([this.queue, slin16Buf]);
    if (!this.playing) this.startPlayback();
  }

  private startPlayback(): void {
    if (this.playing) return;
    this.playing = true;

    this.timer = setInterval(() => {
      if (this.queue.length === 0) {
        this.stopPlayback();
        return;
      }
      if (this.socket.destroyed) {
        this.stopPlayback();
        return;
      }

      const frameLen = Math.min(FRAME_SIZE, this.queue.length);
      const frame = this.queue.subarray(0, frameLen);
      this.queue = this.queue.subarray(frameLen);

      const header = Buffer.alloc(3);
      header[0] = MSG_AUDIO;
      header.writeUInt16BE(frame.length, 1);
      this.socket.write(Buffer.concat([header, frame]));
    }, FRAME_MS);
  }

  private stopPlayback(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.playing = false;
  }

  flush(): void {
    this.queue = Buffer.alloc(0);
    this.stopPlayback();
  }

  destroy(): void {
    this.flush();
  }
}
