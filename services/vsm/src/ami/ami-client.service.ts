import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import * as net from 'net';

export interface AmiAction {
  Action: string;
  [key: string]: string;
}

export interface AmiEvent {
  Event: string;
  [key: string]: string;
}

type EventHandler = (event: AmiEvent) => void;

/**
 * Low-level AMI TCP client.
 * Handles login, event parsing, action execution, and auto-reconnect.
 *
 * AMI protocol notes:
 * - Greeting: single line "Asterisk Call Manager/X.X\r\n" — NOT double-CRLF terminated
 * - Messages (events/responses): key-value pairs separated by \r\n, terminated by \r\n\r\n
 * - Actions: same format, terminated by \r\n\r\n
 */
@Injectable()
export class AmiClientService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AmiClientService.name);

  private socket: net.Socket | null = null;
  private buffer = '';
  private greetingReceived = false;
  private loggedIn = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  private readonly host: string;
  private readonly port: number;
  private readonly username: string;
  private readonly secret: string;
  private readonly reconnectDelay: number;

  private readonly eventHandlers: EventHandler[] = [];
  private readonly pendingActions = new Map<string, (response: Record<string, string>) => void>();
  private actionSeq = 0;

  constructor() {
    this.host = process.env['AMI_HOST'] || '127.0.0.1';
    this.port = parseInt(process.env['AMI_PORT'] || '5038', 10);
    this.username = process.env['AMI_USERNAME'] || '';
    this.secret = process.env['AMI_SECRET'] || '';
    this.reconnectDelay = parseInt(process.env['AMI_RECONNECT_DELAY'] || '5000', 10);
  }

  onApplicationBootstrap() {
    this.connect();
  }

  onApplicationShutdown() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.destroy();
  }

  onEvent(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  async sendAction(action: AmiAction): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      if (!this.loggedIn) {
        reject(new Error('AMI not connected'));
        return;
      }

      const actionId = `vsm-${++this.actionSeq}-${Date.now()}`;
      const timer = setTimeout(() => {
        this.pendingActions.delete(actionId);
        reject(new Error(`AMI action timeout: ${action.Action}`));
      }, 10_000);

      this.pendingActions.set(actionId, (response) => {
        clearTimeout(timer);
        resolve(response);
      });

      const lines: string[] = [`Action: ${action.Action}`, `ActionID: ${actionId}`];
      for (const [key, value] of Object.entries(action)) {
        if (key !== 'Action') lines.push(`${key}: ${value}`);
      }
      lines.push('', ''); // blank line terminates action
      this.socket?.write(lines.join('\r\n'));
    });
  }

  private connect(): void {
    if (this.destroyed) return;
    this.logger.log(`Connecting to Asterisk AMI ${this.host}:${this.port}...`);

    this.socket = new net.Socket();
    this.buffer = '';
    this.greetingReceived = false;
    this.loggedIn = false;

    this.socket.connect(this.port, this.host);

    this.socket.on('data', (data) => {
      this.buffer += data.toString('utf8');
      this.parseBuffer();
    });

    this.socket.on('error', (err) => {
      this.logger.error(`AMI socket error: ${err.message}`);
    });

    this.socket.on('close', () => {
      this.loggedIn = false;
      this.logger.warn('AMI connection closed, scheduling reconnect...');
      this.scheduleReconnect();
    });
  }

  private parseBuffer(): void {
    // Handle greeting first — it's terminated by a single \r\n
    if (!this.greetingReceived) {
      const idx = this.buffer.indexOf('\r\n');
      if (idx === -1) return; // incomplete greeting
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      this.greetingReceived = true;
      if (line.startsWith('Asterisk Call Manager')) {
        this.login();
      } else {
        this.logger.warn(`Unexpected greeting: ${line}`);
      }
      // Fall through to parse any remaining buffered data
    }

    // Parse regular messages — each terminated by \r\n\r\n
    let idx: number;
    while ((idx = this.buffer.indexOf('\r\n\r\n')) !== -1) {
      const raw = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 4);
      if (raw.trim()) this.handleMessage(raw);
    }
  }

  private handleMessage(raw: string): void {
    const msg: Record<string, string> = {};
    for (const line of raw.split('\r\n')) {
      const sep = line.indexOf(': ');
      if (sep !== -1) {
        msg[line.slice(0, sep)] = line.slice(sep + 2);
      }
    }

    if (!msg['Event'] && !msg['Response']) return;

    // Route action responses
    const actionId = msg['ActionID'];
    if (actionId && this.pendingActions.has(actionId)) {
      const handler = this.pendingActions.get(actionId)!;
      this.pendingActions.delete(actionId);
      handler(msg);
      return;
    }

    // Login response
    if (msg['Response'] === 'Success' && !this.loggedIn) {
      this.loggedIn = true;
      this.logger.log('AMI login successful');
      return;
    }

    if (msg['Response'] === 'Error' && !this.loggedIn) {
      this.logger.error('AMI login failed: ' + msg['Message']);
      this.socket?.destroy();
      return;
    }

    // Dispatch events
    if (msg['Event']) {
      for (const handler of this.eventHandlers) {
        handler(msg as AmiEvent);
      }
    }
  }

  private login(): void {
    const action = `Action: Login\r\nUsername: ${this.username}\r\nSecret: ${this.secret}\r\n\r\n`;
    this.socket?.write(action);
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
  }

  isConnected(): boolean {
    return this.loggedIn;
  }
}
