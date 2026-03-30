#!/usr/bin/env node
/**
 * Generate ES256 (ECDSA P-256) key pair for AIWM External Signing Keys.
 *
 * Usage:
 *   node scripts/generate-ec-keypair.js [output-dir] [key-id]
 *
 * Examples:
 *   node scripts/generate-ec-keypair.js                        # output to ./tmp/
 *   node scripts/generate-ec-keypair.js ./secrets/partner      # custom dir
 *   node scripts/generate-ec-keypair.js ./secrets/partner prod-key-001
 *
 * Output files:
 *   <output-dir>/private.pem   — PKCS8 private key (keep secret)
 *   <output-dir>/public.pem    — SPKI public key   (upload to AIWM portal)
 *
 * After generating, upload public.pem content to:
 *   Stack AI Portal → Agent → View Details → Public Keys → Add Key
 */

const { generateKeyPairSync } = require('crypto');
const fs   = require('fs');
const path = require('path');

const outDir = path.resolve(process.argv[2] || './tmp');
const keyId  = process.argv[3] || 'key-' + Date.now();

// ─── Generate ────────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// ─── Write files ─────────────────────────────────────────────────────────────

fs.mkdirSync(outDir, { recursive: true });

const privatePath = path.join(outDir, 'private.pem');
const publicPath  = path.join(outDir, 'public.pem');

fs.writeFileSync(privatePath, privateKey,  { mode: 0o600 });
fs.writeFileSync(publicPath,  publicKey);

// ─── Output ──────────────────────────────────────────────────────────────────

console.log('\n=== EC Key Pair Generated (ES256 / P-256) ===\n');
console.log(`Key ID (kid) : ${keyId}`);
console.log(`Output dir   : ${outDir}`);
console.log(`Private key  : ${privatePath}  (mode 600 — keep secret)`);
console.log(`Public key   : ${publicPath}`);

console.log('\n--- Public Key (upload to AIWM Portal) ---\n');
console.log(publicKey);

console.log('--- Next steps ---');
console.log('1. Go to Stack AI Portal → Agent → View Details → Public Keys → Add Key');
console.log(`2. Fill in keyId: "${keyId}"`);
console.log('3. Paste the public key above');
console.log('4. Use private.pem on your server to sign anonymous tokens\n');

console.log('--- Sample token payload ---');
console.log(JSON.stringify({
  type:        'anonymous',
  agentId:     '<agentId>',
  anonymousId: '<uuid>',
  iat:         Math.floor(Date.now() / 1000),
  exp:         Math.floor(Date.now() / 1000) + 86400,
}, null, 2));
console.log('\n--- JWT header (set in your signing library) ---');
console.log(JSON.stringify({ alg: 'ES256', kid: keyId }, null, 2));
console.log();
