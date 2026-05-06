#!/usr/bin/env node
/**
 * Debug tool: simulate engineer agent heartbeat to AWS gateway.
 * Usage:
 *   AGENT_TOKEN=<jwt> node scripts/debug-agent-heartbeat.js
 *   AGENT_TOKEN=<jwt> WS_URL=wss://skt.x-or.cloud WS_PATH=/agent/socket.io node scripts/debug-agent-heartbeat.js
 *
 * Flags:
 *   PAYLOAD=full         (default) status=idle, mcpConnected=true, full availableFunctions
 *   PAYLOAD=minimal      status=idle only — no capabilities (matches assistant agent behavior)
 *   PAYLOAD=no-mcp       status=idle, mcpConnected=false  (reproduces "agent reports MCP down")
 *   PAYLOAD=variants     run all variants sequentially and print summary table
 */

const path = require('path');
const { io } = require(path.resolve(__dirname, '../node_modules/socket.io-client'));

const TOKEN = process.env.AGENT_TOKEN;
const URL = process.env.WS_URL || 'wss://skt.x-or.cloud';
const WS_PATH = process.env.WS_PATH || '/agent/socket.io';
const MODE = process.env.PAYLOAD || 'full';

if (!TOKEN) {
  console.error('AGENT_TOKEN env required');
  process.exit(1);
}

const FULL_FUNCTIONS = [
  'mcp__Builtin__StartWork',
  'mcp__Builtin__BlockWork',
  'mcp__Builtin__UnblockWork',
  'mcp__Builtin__CompleteWork',
  'mcp__Builtin__RequestReviewForWork',
  'mcp__Builtin__RejectReviewForWork',
  'mcp__Builtin__GetWork',
];

const VARIANTS = {
  full:    { status: 'idle', mcpConnected: true,  availableFunctions: FULL_FUNCTIONS },
  minimal: { status: 'idle' },
  'no-mcp':{ status: 'idle', mcpConnected: false, availableFunctions: FULL_FUNCTIONS },
  empty:   { status: 'idle', mcpConnected: true,  availableFunctions: [] },
  'missing-start': { status: 'idle', mcpConnected: true, availableFunctions: ['mcp__Builtin__BlockWork'] },
};

function sendOnce(name, payload) {
  return new Promise((resolve) => {
    const socket = io(URL, {
      path: WS_PATH,
      transports: ['websocket'],
      auth: { token: TOKEN },
      reconnection: false,
      timeout: 8000,
    });

    const done = (result) => {
      try { socket.disconnect(); } catch {}
      resolve(result);
    };

    socket.on('connect', () => {
      socket.emit('agent:heartbeat', payload, (resp) => {
        done({
          name,
          ok: !!resp?.success,
          hasSystemMessage: !!resp?.systemMessage,
          work: resp?.work?.id || null,
          systemTaskType: resp?.systemTask?.type || null,
        });
      });
    });

    socket.on('connect_error', (err) => done({ name, error: `connect_error: ${err.message}` }));
    setTimeout(() => done({ name, error: 'timeout' }), 9000);
  });
}

async function main() {
  console.log(`[debug-heartbeat] url=${URL}${WS_PATH} mode=${MODE}`);

  if (MODE === 'variants') {
    const results = [];
    for (const [name, payload] of Object.entries(VARIANTS)) {
      const r = await sendOnce(name, payload);
      results.push(r);
      await new Promise((r) => setTimeout(r, 400));
    }
    console.table(results);
    return;
  }

  if (!VARIANTS[MODE]) {
    console.error(`Unknown PAYLOAD=${MODE}. Valid: ${Object.keys(VARIANTS).join(', ')}, variants`);
    process.exit(1);
  }

  const r = await sendOnce(MODE, VARIANTS[MODE]);
  console.log(JSON.stringify(r, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
