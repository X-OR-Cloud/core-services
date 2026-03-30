#!/usr/bin/env node
/**
 * Verify an ES256 (ECDSA P-256) key pair and optionally validate a JWT token.
 *
 * Usage:
 *   node scripts/verify-ec-keypair.js [private.pem] [public.pem] [jwt-token]
 *
 * Examples:
 *   node scripts/verify-ec-keypair.js                                         # defaults: ./tmp/private.pem, ./tmp/public.pem
 *   node scripts/verify-ec-keypair.js ./secrets/private.pem ./secrets/public.pem
 *   node scripts/verify-ec-keypair.js ./tmp/private.pem ./tmp/public.pem eyJ0eXAiOiJKV1Qi...
 *
 * Checks performed:
 *   1. Both files exist and are readable
 *   2. Both are valid EC P-256 keys in PEM format
 *   3. Private and public key form a matched pair (sign + verify round-trip)
 *   4. [Optional] If a JWT token is provided — verify its signature against the public key
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const privatePath = path.resolve(process.argv[2] || './tmp/private.pem');
const publicPath  = path.resolve(process.argv[3] || './tmp/public.pem');
const jwtToken    = process.argv[4] || null;

let ok = true;

function pass(msg) { console.log('  ✅', msg); }
function fail(msg) { console.log('  ❌', msg); ok = false; }
function info(msg) { console.log('  ℹ️ ', msg); }
function section(title) { console.log(`\n=== ${title} ===`); }

// ─── 1. File existence ───────────────────────────────────────────────────────

section('1. File Check');

let privateKeyPem, publicKeyPem;

if (fs.existsSync(privatePath)) {
  pass(`private.pem found: ${privatePath}`);
  privateKeyPem = fs.readFileSync(privatePath, 'utf8');
} else {
  fail(`private.pem NOT found: ${privatePath}`);
}

if (fs.existsSync(publicPath)) {
  pass(`public.pem found: ${publicPath}`);
  publicKeyPem = fs.readFileSync(publicPath, 'utf8');
} else {
  fail(`public.pem NOT found: ${publicPath}`);
}

if (!privateKeyPem || !publicKeyPem) {
  console.log('\n⛔ Cannot continue — missing key files.\n');
  process.exit(1);
}

// ─── 2. Parse keys ───────────────────────────────────────────────────────────

section('2. Key Parsing');

let privateKey, publicKey;

try {
  privateKey = crypto.createPrivateKey({ key: privateKeyPem, format: 'pem' });
  const details = privateKey.asymmetricKeyDetails;
  pass(`private.pem is a valid ${privateKey.asymmetricKeyType.toUpperCase()} key`);
  if (details?.namedCurve) info(`Curve: ${details.namedCurve}`);
  if (details?.namedCurve !== 'prime256v1') fail(`Expected P-256 (prime256v1), got: ${details?.namedCurve}`);
  else pass('Curve is P-256 (prime256v1) — correct for ES256');
} catch (e) {
  fail(`private.pem parse error: ${e.message}`);
}

try {
  publicKey = crypto.createPublicKey({ key: publicKeyPem, format: 'pem' });
  const details = publicKey.asymmetricKeyDetails;
  pass(`public.pem is a valid ${publicKey.asymmetricKeyType.toUpperCase()} key`);
  if (details?.namedCurve) info(`Curve: ${details.namedCurve}`);
  if (details?.namedCurve !== 'prime256v1') fail(`Expected P-256 (prime256v1), got: ${details?.namedCurve}`);
  else pass('Curve is P-256 (prime256v1) — correct for ES256');
} catch (e) {
  fail(`public.pem parse error: ${e.message}`);
}

if (!privateKey || !publicKey) {
  console.log('\n⛔ Cannot continue — key parsing failed.\n');
  process.exit(1);
}

// ─── 3. Key pair match ───────────────────────────────────────────────────────

section('3. Key Pair Match (sign + verify round-trip)');

try {
  const testData = `aiwm-keypair-verify-${Date.now()}`;

  const sign = crypto.createSign('SHA256');
  sign.update(testData);
  const signature = sign.sign(privateKey, 'base64url');

  const verify = crypto.createVerify('SHA256');
  verify.update(testData);
  const matched = verify.verify(publicKey, signature, 'base64url');

  if (matched) {
    pass('Private key signed data and public key verified it successfully');
    pass('Keys are a MATCHED PAIR ✓');
  } else {
    fail('Verification failed — private.pem and public.pem are NOT a matched pair');
  }
} catch (e) {
  fail(`Round-trip error: ${e.message}`);
}

// ─── 4. JWT token verification (optional) ────────────────────────────────────

if (jwtToken) {
  section('4. JWT Token Verification');

  const parts = jwtToken.split('.');
  if (parts.length !== 3) {
    fail('Invalid JWT format (expected 3 parts separated by ".")');
  } else {
    // Decode header & payload
    let header, payload;
    try {
      header  = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch (e) {
      fail(`JWT decode error: ${e.message}`);
    }

    if (header && payload) {
      info(`alg: ${header.alg}`);
      info(`kid: ${header.kid ?? '(none)'}`);
      info(`type: ${payload.type}`);
      info(`agentId: ${payload.agentId ?? '(none)'}`);
      info(`anonymousId: ${payload.anonymousId ?? '(none)'}`);

      // Expiry check
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload.exp) {
        const expDate = new Date(payload.exp * 1000).toISOString();
        if (payload.exp < nowSec) fail(`Token EXPIRED at ${expDate}`);
        else pass(`Token not expired (exp: ${expDate})`);
      } else {
        info('No exp claim — token does not expire');
      }

      // Algorithm check
      if (header.alg !== 'ES256') {
        fail(`Expected alg=ES256, got: ${header.alg}`);
      } else {
        pass('alg is ES256');
      }

      // Signature verification
      try {
        const verifyJwt = crypto.createVerify('SHA256');
        verifyJwt.update(`${parts[0]}.${parts[1]}`);
        const sig = Buffer.from(parts[2], 'base64url');
        // ES256 signatures from jsonwebtoken are DER-encoded (IEEE P1363 format)
        const valid = verifyJwt.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, sig);
        if (valid) {
          pass('JWT signature is VALID — token was signed by the private key matching public.pem ✓');
        } else {
          fail('JWT signature INVALID — token was NOT signed by the private key matching public.pem');
          info('Possible causes:');
          info('  - Token was signed with a different private key');
          info('  - Wrong public.pem file provided');
        }
      } catch (e) {
        fail(`JWT signature check error: ${e.message}`);
      }
    }
  }
} else {
  console.log('\n(No JWT token provided — skipping token verification)');
  info('To also verify a token: node scripts/verify-ec-keypair.js <private.pem> <public.pem> <token>');
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n=== Summary ===\n');
if (ok) {
  console.log('✅ All checks passed\n');
} else {
  console.log('❌ One or more checks FAILED — see above for details\n');
  process.exit(1);
}
