#!/usr/bin/env node
/**
 * Generate a signed ES256 anonymous chat token for AIWM WebSocket connection.
 *
 * Usage:
 *   node scripts/generate-chat-token.js --privateKey <path> --agentId <id> [options]
 *
 * Required:
 *   --privateKey  Path to PKCS8 private key PEM file
 *   --agentId     Agent ID on AIWM
 *
 * Optional:
 *   --kid         Key ID (kid header). Default: basename of privateKey dir
 *   --anonymousId UUID to identify the user/session. Default: auto-generated
 *   --expiresIn   Token lifetime in seconds. Default: 86400 (24h)
 *
 * Examples:
 *   node scripts/generate-chat-token.js \
 *     --privateKey ./tmp/private.pem \
 *     --agentId 69b219445f803203cf8ab6f3 \
 *     --kid test-key-002
 *
 *   node scripts/generate-chat-token.js \
 *     --privateKey ./tmp/keys/private.pem \
 *     --agentId 69b219445f803203cf8ab6f3 \
 *     --kid prod-key-001 \
 *     --anonymousId 019d3cfb-879c-73b5-bcdd-086dcfff608b \
 *     --expiresIn 3600
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

// ─── Parse args ──────────────────────────────────────────────────────────────

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) {
    args[process.argv[i].slice(2)] = process.argv[i + 1];
    i++;
  }
}

const privatePath = args.privateKey ? path.resolve(args.privateKey) : null;
const agentId     = args.agentId    || null;
const expiresIn   = parseInt(args.expiresIn || '86400', 10);

if (!privatePath || !agentId) {
  console.error('Usage: node scripts/generate-chat-token.js --privateKey <path> --agentId <id> [--kid <kid>] [--anonymousId <uuid>] [--expiresIn <seconds>]');
  process.exit(1);
}

// ─── Load private key ────────────────────────────────────────────────────────

if (!fs.existsSync(privatePath)) {
  console.error(`❌ Private key not found: ${privatePath}`);
  process.exit(1);
}

let privateKey;
try {
  const pem = fs.readFileSync(privatePath, 'utf8');
  privateKey = crypto.createPrivateKey({ key: pem, format: 'pem' });
} catch (e) {
  console.error(`❌ Failed to load private key: ${e.message}`);
  process.exit(1);
}

// ─── Derive kid from private key directory name if not provided ──────────────

const kid = args.kid || path.basename(path.dirname(privatePath));

// ─── Build payload ───────────────────────────────────────────────────────────

const anonymousId = args.anonymousId || crypto.randomUUID();
const iat = Math.floor(Date.now() / 1000);
const exp = iat + expiresIn;

const header = { typ: 'JWT', alg: 'ES256', kid };
const payload = {
  type:        'anonymous',
  agentId,
  anonymousId,
  iat,
  exp,
};

// ─── Sign ────────────────────────────────────────────────────────────────────

const headerB64  = Buffer.from(JSON.stringify(header)).toString('base64url');
const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
const signingInput = `${headerB64}.${payloadB64}`;

const sign = crypto.createSign('SHA256');
sign.update(signingInput);
const signature = sign.sign(privateKey, 'base64url');

const token = `${signingInput}.${signature}`;

// ─── Output ──────────────────────────────────────────────────────────────────

console.log('\n=== AIWM Anonymous Chat Token ===\n');
console.log('Header:');
console.log(JSON.stringify(header, null, 2));
console.log('\nPayload:');
console.log(JSON.stringify({
  ...payload,
  iat_human: new Date(iat * 1000).toISOString(),
  exp_human: new Date(exp * 1000).toISOString(),
}, null, 2));
console.log('\n--- Token ---\n');
console.log(token);
console.log('\n--- SDK Init ---\n');
console.log(`StackAIChat.init({`);
console.log(`  wsUrl: 'wss://skt.x-or.cloud/ws/chat',`);
console.log(`  token: '${token}',`);
console.log(`})`);
console.log('\n--- Verify command ---\n');
console.log(`node scripts/verify-ec-keypair.js ${privatePath} ${path.join(path.dirname(privatePath), 'public.pem')} ${token}`);
console.log();
