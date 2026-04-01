import { tool } from 'ai';
import { zodSchema } from 'ai';
import { z } from 'zod';
import type Redis from 'ioredis';

export const CONNECTION_TOOL_NAMES = [
  'mcp__Chat__SendMessage',
  'mcp__Chat__SendEmbed',
  'mcp__Chat__SendFile',
] as const;

export interface ChannelSendToolsContext {
  redisPub: Redis;
  /** 'assistant' agents upload base64 internally; 'engineer' agents POST multipart to REST API */
  agentType: 'assistant' | 'engineer';
  /** assistant only — direct S3 upload callback */
  uploadFileInternal?: (base64: string, filename: string, mimeType: string) => Promise<string>;
  /** engineer only — base URL of AIWM REST API (e.g. http://localhost:3003) */
  apiBaseUrl?: string;
  /** engineer only — agent JWT to authenticate file upload */
  accessToken?: string;
}

const embedSchema = z.object({
  title: z.string().optional().describe('Embed title'),
  description: z.string().optional().describe('Main body text of the embed'),
  color: z.number().optional().describe('Discord only: decimal color integer (e.g. 5793266 for blue)'),
  url: z.string().optional().describe('Clickable URL attached to the title'),
  imageUrl: z.string().optional().describe('Image URL to display in the embed'),
  footer: z.string().optional().describe('Footer text'),
  fields: z
    .array(z.object({ name: z.string(), value: z.string(), inline: z.boolean().optional() }))
    .optional()
    .describe('List of name/value fields'),
});

/**
 * Builtin tools for agents to proactively send messages, embeds, or files
 * to a specific platform channel via an active Connection.
 */
export function createChannelSendTools(ctx: ChannelSendToolsContext) {
  const { redisPub } = ctx;

  return {
    mcp__Chat__SendMessage: tool({
      description:
        'Send a plain text message proactively to a specific channel on a connected platform (Discord, Telegram, Teams). ' +
        'Use this when you need to push a notification or message to a channel without waiting for a user message. ' +
        'Requires connectionId (the Connection configured with the bot) and channelId (the target channel/chat ID).',
      inputSchema: zodSchema(z.object({
        connectionId: z.string().describe('ID of the Connection (bot) to send through'),
        channelId: z.string().describe('Platform channel ID or chat ID to send the message to'),
        content: z.string().describe('The message content to send'),
        conversationId: z.string().optional().describe('Optional: link this message to an existing conversation for audit trail'),
      })),
      execute: async ({ connectionId, channelId, content, conversationId }) => {
        return _publishChannelSend(redisPub, { connectionId, channelId, content, conversationId });
      },
    }),

    mcp__Chat__SendEmbed: tool({
      description:
        'Send a rich embed message proactively to a specific channel on a connected platform. ' +
        'Discord renders native embeds (title, description, color, fields, image). ' +
        'Telegram and Teams fall back to formatted text. ' +
        'At least one of title, description, or fields must be provided.',
      inputSchema: zodSchema(z.object({
        connectionId: z.string().describe('ID of the Connection (bot) to send through'),
        channelId: z.string().describe('Platform channel ID or chat ID to send the embed to'),
        embed: embedSchema.describe('Embed content'),
        conversationId: z.string().optional().describe('Optional: link this message to an existing conversation for audit trail'),
      })),
      execute: async ({ connectionId, channelId, embed, conversationId }) => {
        return _publishChannelSend(redisPub, { connectionId, channelId, embed, conversationId });
      },
    }),

    mcp__Chat__SendFile: tool({
      description:
        'Upload a file to S3 and send it to a specific platform channel. ' +
        'For assistant agents: provide fileBase64 + filename + mimeType. ' +
        'For engineer agents: provide filePath (local filesystem path). ' +
        'Supports images, documents, audio, and video.',
      inputSchema: zodSchema(z.object({
        connectionId: z.string().describe('ID of the Connection (bot) to send through'),
        channelId: z.string().describe('Platform channel ID or chat ID to send the file to'),
        fileBase64: z.string().optional().describe('Base64-encoded file content (use for assistant agents or when you have in-memory content)'),
        filePath: z.string().optional().describe('Local filesystem path to the file (use for engineer agents with filesystem access)'),
        filename: z.string().describe('Filename including extension, e.g. report.pdf'),
        mimeType: z.string().describe('MIME type, e.g. image/png, application/pdf, video/mp4'),
        caption: z.string().optional().describe('Optional caption to accompany the file'),
        conversationId: z.string().optional().describe('Optional: link this message to an existing conversation for audit trail'),
      })),
      execute: async ({ connectionId, channelId, fileBase64, filePath, filename, mimeType, caption, conversationId }) => {
        try {
          let fileUrl: string;

          if (ctx.agentType === 'assistant') {
            // assistant: upload via internal callback
            if (!fileBase64) {
              return { success: false, error: 'assistant agents must provide fileBase64' };
            }
            if (!ctx.uploadFileInternal) {
              return { success: false, error: 'uploadFileInternal is not configured for this agent' };
            }
            fileUrl = await ctx.uploadFileInternal(fileBase64, filename, mimeType);
          } else {
            // engineer: upload via REST API using filePath or fileBase64
            if (!ctx.apiBaseUrl || !ctx.accessToken) {
              return { success: false, error: 'apiBaseUrl and accessToken are required for engineer agents' };
            }

            let buffer: Buffer;
            if (filePath) {
              const { readFile } = await import('fs/promises');
              buffer = await readFile(filePath);
            } else if (fileBase64) {
              buffer = Buffer.from(fileBase64, 'base64');
            } else {
              return { success: false, error: 'engineer agents must provide filePath or fileBase64' };
            }

            const formData = new FormData();
            formData.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

            const res = await fetch(`${ctx.apiBaseUrl}/files/upload`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${ctx.accessToken}` },
              body: formData,
            });

            if (!res.ok) {
              const err = await res.text();
              return { success: false, error: `File upload failed: ${res.status} ${err}` };
            }

            const json = await res.json() as { fileUrl: string };
            fileUrl = json.fileUrl;
          }

          return _publishChannelSend(redisPub, {
            connectionId,
            channelId,
            file: { fileUrl, filename, mimeType, caption },
            conversationId,
          });
        } catch (err: any) {
          return { success: false, error: `SendFile failed: ${err.message}` };
        }
      },
    }),
  };
}

async function _publishChannelSend(
  redisPub: Redis,
  payload: object,
): Promise<{ success: boolean; connectionId?: string; channelId?: string; error?: string }> {
  try {
    await redisPub.publish('outbound:direct', JSON.stringify(payload));
    return { success: true };
  } catch (err: any) {
    return { success: false, error: `channel:send publish failed: ${err.message}` };
  }
}
