import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { BrowserContext } from './browser.types';

/**
 * All function names exposed by the BrowserAutomation tool.
 * Must match BUILTIN_TOOL_FUNCTIONS["BrowserAutomation"] in tool.service.ts.
 */
export const BROWSER_TOOL_FUNCTIONS = [
  'mcp__Browser__OpenTab',
  'mcp__Browser__CloseTab',
  'mcp__Browser__ListTabs',
  'mcp__Browser__GetTab',
  'mcp__Browser__Navigate',
  'mcp__Browser__GetSnapshot',
  'mcp__Browser__GetText',
  'mcp__Browser__Screenshot',
  'mcp__Browser__ExecuteAction',
  'mcp__Browser__ExecuteActions',
  'mcp__Browser__Evaluate',
  'mcp__Browser__GetCookies',
  'mcp__Browser__SetCookies',
  'mcp__Browser__ExportPdf',
  'mcp__Browser__LockTab',
  'mcp__Browser__UnlockTab',
] as const;

/** Throw if browser instance is not ready */
function requireInstance(ctx: BrowserContext): string {
  if (!ctx.instanceId) {
    throw new Error('Browser instance is not running. PinchTab may still be starting up.');
  }
  return ctx.instanceId;
}

async function pinchtabGet(ctx: BrowserContext, path: string): Promise<unknown> {
  const res = await fetch(`${ctx.config.apiUrl}${path}`);
  if (!res.ok) throw new Error(`PinchTab GET ${path} failed: ${res.status}`);
  return res.json();
}

async function pinchtabPost(ctx: BrowserContext, path: string, body?: object): Promise<unknown> {
  const res = await fetch(`${ctx.config.apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`PinchTab POST ${path} failed: ${res.status}`);
  return res.json();
}

async function pinchtabGetBinary(ctx: BrowserContext, path: string): Promise<Buffer> {
  const res = await fetch(`${ctx.config.apiUrl}${path}`);
  if (!res.ok) throw new Error(`PinchTab GET ${path} failed: ${res.status}`);
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = (await res.json()) as { data?: string; url?: string };
    if (data.url) {
      const r2 = await fetch(data.url);
      return Buffer.from(await r2.arrayBuffer());
    }
    if (data.data) {
      return Buffer.from(data.data, 'base64');
    }
    throw new Error('Unexpected JSON response from PinchTab binary endpoint');
  }

  return Buffer.from(await res.arrayBuffer());
}

async function saveTempFile(buf: Buffer, ext: string, tabId: string): Promise<string> {
  const filename = `browser_${tabId}_${Date.now()}.${ext}`;
  const filePath = join(tmpdir(), filename);
  await writeFile(filePath, buf);
  return filePath;
}

/**
 * Creates Vercel AI SDK v6 tool definitions for browser automation.
 * Tools are keyed as mcp__Browser__<ToolName> to match allowedFunctions convention.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createBrowserTools(ctx: BrowserContext): Record<string, any> {
  return {
    mcp__Browser__OpenTab: tool({
      description: 'Open a new browser tab, optionally navigate to a URL immediately.',
      inputSchema: zodSchema(z.object({
        url: z.string().optional().describe('URL to navigate to after opening the tab'),
      })),
      execute: async ({ url }) => {
        const instanceId = requireInstance(ctx);
        return pinchtabPost(ctx, `/instances/${instanceId}/tabs/open`, { url });
      },
    }),

    mcp__Browser__CloseTab: tool({
      description: 'Close a browser tab by tabId.',
      inputSchema: zodSchema(z.object({
        tabId: z.string().describe('Tab ID to close'),
      })),
      execute: async ({ tabId }) => {
        requireInstance(ctx);
        return pinchtabPost(ctx, `/tabs/${tabId}/close`);
      },
    }),

    mcp__Browser__ListTabs: tool({
      description: 'List all open browser tabs in the current instance.',
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        const instanceId = requireInstance(ctx);
        return pinchtabGet(ctx, `/tabs?instanceId=${instanceId}`);
      },
    }),

    mcp__Browser__GetTab: tool({
      description: 'Get details of a specific browser tab.',
      inputSchema: zodSchema(z.object({
        tabId: z.string().describe('Tab ID'),
      })),
      execute: async ({ tabId }) => {
        requireInstance(ctx);
        return pinchtabGet(ctx, `/tabs/${tabId}`);
      },
    }),

    mcp__Browser__Navigate: tool({
      description: 'Navigate a tab to a URL.',
      inputSchema: zodSchema(z.object({
        tabId: z.string().describe('Tab ID'),
        url: z.string().describe('URL to navigate to'),
      })),
      execute: async ({ tabId, url }) => {
        requireInstance(ctx);
        return pinchtabPost(ctx, `/tabs/${tabId}/navigate`, {
          url,
          timeout: ctx.config.navigateTimeout * 1000,
        });
      },
    }),

    mcp__Browser__GetSnapshot: tool({
      description: 'Get a DOM snapshot of the tab with interactive elements and links.',
      inputSchema: zodSchema(z.object({
        tabId: z.string().describe('Tab ID'),
      })),
      execute: async ({ tabId }) => {
        requireInstance(ctx);
        return pinchtabGet(
          ctx,
          `/tabs/${tabId}/snapshot?depth=${ctx.config.snapshotDepth}&maxTokens=${ctx.config.snapshotMaxTokens}`,
        );
      },
    }),

    mcp__Browser__GetText: tool({
      description: 'Get all visible text content of the tab.',
      inputSchema: zodSchema(z.object({
        tabId: z.string().describe('Tab ID'),
      })),
      execute: async ({ tabId }) => {
        requireInstance(ctx);
        return pinchtabGet(ctx, `/tabs/${tabId}/text`);
      },
    }),

    mcp__Browser__Screenshot: tool({
      description: 'Take a screenshot of the tab. The image will be sent automatically to the current conversation.',
      inputSchema: zodSchema(z.object({
        tabId: z.string().describe('Tab ID'),
        message: z.string().optional().describe('Caption for the screenshot'),
      })),
      execute: async ({ tabId, message }) => {
        requireInstance(ctx);
        const buf = await pinchtabGetBinary(
          ctx,
          `/tabs/${tabId}/screenshot?quality=${ctx.config.screenshotQuality}`,
        );
        const filePath = await saveTempFile(buf, 'jpg', tabId);

        if (ctx.conversationId && ctx.sendFile) {
          await ctx.sendFile(ctx.conversationId, filePath, message || `Screenshot of tab ${tabId}`);
        }

        return { success: true, filePath, tabId };
      },
    }),

    mcp__Browser__ExecuteAction: tool({
      description: 'Execute a single browser action on a tab element (click, type, fill, hover, scroll, etc.).',
      inputSchema: zodSchema(z.object({
        tabId: z.string().describe('Tab ID'),
        kind: z.string().describe('Action kind: click, type, fill, hover, scroll, select, check, uncheck'),
        ref: z.string().optional().describe('Element reference from GetSnapshot'),
        text: z.string().optional().describe('Text for type/fill actions'),
        x: z.number().optional().describe('X coordinate for scroll'),
        y: z.number().optional().describe('Y coordinate for scroll'),
      })),
      execute: async ({ tabId, ...action }) => {
        requireInstance(ctx);
        return pinchtabPost(ctx, `/tabs/${tabId}/action`, action);
      },
    }),

    mcp__Browser__ExecuteActions: tool({
      description: 'Execute multiple browser actions in sequence on a tab.',
      inputSchema: zodSchema(z.object({
        tabId: z.string().describe('Tab ID'),
        actions: z.array(z.object({
          kind: z.string(),
          ref: z.string().optional(),
          text: z.string().optional(),
          x: z.number().optional(),
          y: z.number().optional(),
        })).describe('Array of actions to execute'),
      })),
      execute: async ({ tabId, actions }) => {
        requireInstance(ctx);
        return pinchtabPost(ctx, `/tabs/${tabId}/actions`, { actions });
      },
    }),

    mcp__Browser__Evaluate: tool({
      description: 'Execute JavaScript code in the context of the tab page.',
      inputSchema: zodSchema(z.object({
        tabId: z.string().describe('Tab ID'),
        script: z.string().describe('JavaScript code to execute'),
      })),
      execute: async ({ tabId, script }) => {
        requireInstance(ctx);
        return pinchtabPost(ctx, `/tabs/${tabId}/evaluate`, { script });
      },
    }),

    mcp__Browser__GetCookies: tool({
      description: 'Get all cookies for the current tab.',
      inputSchema: zodSchema(z.object({
        tabId: z.string().describe('Tab ID'),
      })),
      execute: async ({ tabId }) => {
        requireInstance(ctx);
        return pinchtabGet(ctx, `/tabs/${tabId}/cookies`);
      },
    }),

    mcp__Browser__SetCookies: tool({
      description: 'Set cookies for the current tab.',
      inputSchema: zodSchema(z.object({
        tabId: z.string().describe('Tab ID'),
        cookies: z.array(z.object({
          name: z.string(),
          value: z.string(),
          domain: z.string().optional(),
          path: z.string().optional(),
          expires: z.number().optional(),
          httpOnly: z.boolean().optional(),
          secure: z.boolean().optional(),
        })).describe('Cookies to set'),
      })),
      execute: async ({ tabId, cookies }) => {
        requireInstance(ctx);
        return pinchtabPost(ctx, `/tabs/${tabId}/cookies`, { cookies });
      },
    }),

    mcp__Browser__ExportPdf: tool({
      description: 'Export the tab as a PDF. The file will be sent automatically to the current conversation.',
      inputSchema: zodSchema(z.object({
        tabId: z.string().describe('Tab ID'),
        message: z.string().optional().describe('Caption for the PDF'),
      })),
      execute: async ({ tabId, message }) => {
        requireInstance(ctx);
        const buf = await pinchtabGetBinary(ctx, `/tabs/${tabId}/pdf`);
        const filePath = await saveTempFile(buf, 'pdf', tabId);

        if (ctx.conversationId && ctx.sendFile) {
          await ctx.sendFile(ctx.conversationId, filePath, message || `PDF export of tab ${tabId}`);
        }

        return { success: true, filePath, tabId };
      },
    }),

    mcp__Browser__LockTab: tool({
      description: 'Lock a tab to prevent concurrent edits from other conversations.',
      inputSchema: zodSchema(z.object({
        tabId: z.string().describe('Tab ID'),
      })),
      execute: async ({ tabId }) => {
        requireInstance(ctx);
        return pinchtabPost(ctx, `/tabs/${tabId}/lock`, { ttl: ctx.config.lockTtl });
      },
    }),

    mcp__Browser__UnlockTab: tool({
      description: 'Release the lock on a tab.',
      inputSchema: zodSchema(z.object({
        tabId: z.string().describe('Tab ID'),
      })),
      execute: async ({ tabId }) => {
        requireInstance(ctx);
        return pinchtabPost(ctx, `/tabs/${tabId}/unlock`);
      },
    }),
  };
}
