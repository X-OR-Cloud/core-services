#!/usr/bin/env node
/**
 * License key generator
 *
 * Usage:
 *   node licenses/gen-license.js <slug> <expiry YYYY-MM-DD>
 *
 * Example:
 *   node licenses/gen-license.js mb-bank 2027-04-25
 *
 * Output:
 *   - LICENSE_SECRET  →  DevOps dùng làm env var khi build
 *   - .license file   →  deploy lên server khách (licenses/output/<slug>.license)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const slug = process.argv[2];
const expiry = process.argv[3];

if (!slug || !expiry) {
  console.error('Usage: node licenses/gen-license.js <slug> <expiry YYYY-MM-DD>');
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
  console.error('Invalid date format. Use YYYY-MM-DD (e.g. 2027-04-25)');
  process.exit(1);
}

const customersPath = path.join(__dirname, 'customers.json');
if (!fs.existsSync(customersPath)) {
  console.error('customers.json not found. Copy from customers.example.json and fill in secrets.');
  process.exit(1);
}

const customers = JSON.parse(fs.readFileSync(customersPath, 'utf-8'));
const customer = customers[slug];

if (!customer) {
  console.error(`Customer "${slug}" not found.`);
  console.error('Available:', Object.keys(customers).join(', '));
  process.exit(1);
}

const content = `expiry=${expiry}`;
const sig = crypto.createHmac('sha256', customer.secret).update(content).digest('hex');
const licenseContent = `${content}\nsig=${sig}`;

const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
const outputFile = path.join(outputDir, `${slug}.license`);
fs.writeFileSync(outputFile, licenseContent);

const line = '─'.repeat(52);
console.log(`\n┌${line}┐`);
console.log(`│  Customer : ${customer.name.padEnd(38)}│`);
console.log(`│  Slug     : ${slug.padEnd(38)}│`);
console.log(`│  Expiry   : ${expiry.padEnd(38)}│`);
console.log(`└${line}┘\n`);

console.log('── 1. BUILD ENV VAR ─────────────────────────────');
console.log(`   LICENSE_SECRET=${customer.secret}\n`);

console.log('── 2. BUILD COMMAND ─────────────────────────────');
console.log(`   LICENSE_SECRET=${customer.secret} nx run aiwm:build\n`);

console.log('── 3. LICENSE FILE ──────────────────────────────');
console.log(`   Saved to: ${outputFile}`);
console.log(`   Deploy file .license này lên server khách.\n`);
console.log(`   Content:`);
console.log(`   ${licenseContent.replace('\n', '\n   ')}\n`);
