export interface BrowserConfig {
  apiUrl: string;
  mode: 'headless' | 'headed';
  width: number;
  height: number;
  navigateTimeout: number;
  blockImages: boolean;
  screenshotQuality: number;
  snapshotDepth: number;
  snapshotMaxTokens: number;
  lockTtl: number;
}

export interface BrowserContext {
  /** Set by BrowserInstanceManager after start(), read by tools at execution time */
  instanceId: string | null;
  config: BrowserConfig;
  /** Current conversationId — synced before each generateText() call */
  conversationId: string | null;
  /** Callback to send file (screenshot/PDF) back to chat */
  sendFile: (conversationId: string, filePath: string, caption: string) => Promise<void>;
}
