/**
 * Common utilities for MCP builtin tools
 */

import { Logger } from '@nestjs/common';
import { ExecutionContext, ToolResponse } from './types';

const logger = new Logger('McpUtils');

/**
 * Make an authenticated HTTP request to a service
 */
export async function makeServiceRequest(
  url: string,
  options: RequestInit & {
    context: ExecutionContext;
  }
): Promise<Response> {
  const { context, ...fetchOptions } = options;

  // Prepare headers with JWT token
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${context.token}`,
    ...fetchOptions.headers,
  };
  const maskedHeaders = {
    ...headers,
    Authorization: `Bearer ${headers.Authorization?.substring(0, 7)}****`,
    //Authorization: `Bearer ${headers.Authorization}`,
  };

  logger.log(`📡 Making request: ${fetchOptions.method || 'GET'} ${url}`, {
    headers: headers,
    query: (url.split('?')[1] || '').split('&').reduce((acc, pair) => {
      const [key, value] = pair.split('=');
      if (key) acc[key] = value;
      return acc;
    }, {} as Record<string, string>),
    body: fetchOptions.body,
  });

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  logger.log(
    `✅ Response received: ${response.status} ${response.statusText}`,
    {
      body: fetchOptions.body,
    }
  );

  // Debug: Log response body
  try {
    // Clone response to read body without consuming it
    const clonedResponse = response.clone();
    const contentType = clonedResponse.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const jsonBody = await clonedResponse.json();
      logger.debug(`📥 Response body:`, JSON.stringify(jsonBody, null, 2));
    } else {
      const textBody = await clonedResponse.text();
      logger.debug(`📥 Response body (text):`, textBody.substring(0, 500)); // Log first 500 chars
    }
  } catch {
    logger.debug(`⚠️  Could not parse response body for debugging`);
  }

  return response;
}

/**
 * Format API response as MCP tool response
 */
export async function formatToolResponse(
  response: Response
): Promise<ToolResponse> {
  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    const errorText = await response.text();
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${response.status} ${response.statusText}\n${errorText}`,
        },
      ],
      isError: true,
    };
  }

  let content: string;
  if (contentType.includes('application/json')) {
    const json = await response.json();
    content = JSON.stringify(json, null, 2);
  } else {
    content = await response.text();
  }

  return {
    content: [
      {
        type: 'text',
        text: content,
      },
    ],
  };
}

/**
 * Build query string from object
 */
export function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Get service base URL from environment
 */
export function getServiceBaseUrl(serviceName: 'cbm' | 'iam' | 'aiwm'): string {
  const defaultUrls = {
    cbm: 'http://localhost:3001',
    iam: 'http://localhost:3000',
    aiwm: 'http://localhost:3003',
  };

  const envKey = `${serviceName.toUpperCase()}_SERVICE_URL`;
  return process.env[envKey] || defaultUrls[serviceName];
}
