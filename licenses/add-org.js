#!/usr/bin/env node
/**
 * Add a new org to orgs.json with an auto-generated secret.
 *
 * Usage:
 *   node licenses/add-org.js <slug> [name]
 *
 * Example:
 *   node licenses/add-org.js mb-bank "MB Bank"
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const slug = process.argv[2];
const name = process.argv[3] || slug;

if (!slug) {
  console.error('Usage: node licenses/add-org.js <slug> [name]');
  process.exit(1);
}

if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error('Slug must be lowercase alphanumeric with hyphens only (e.g. mb-bank)');
  process.exit(1);
}

const orgsPath = path.join(__dirname, 'orgs.json');
const orgs = fs.existsSync(orgsPath)
  ? JSON.parse(fs.readFileSync(orgsPath, 'utf-8'))
  : {};

if (orgs[slug]) {
  console.error(`Org "${slug}" already exists.`);
  process.exit(1);
}

const secret = crypto.randomBytes(32).toString('hex');
orgs[slug] = { name, secret };

fs.writeFileSync(orgsPath, JSON.stringify(orgs, null, 2) + '\n');

const line = '─'.repeat(52);
console.log(`\n┌${line}┐`);
console.log(`│  Org    : ${name.padEnd(40)}│`);
console.log(`│  Slug   : ${slug.padEnd(40)}│`);
console.log(`│  Secret : ${secret.padEnd(40)}│`);
console.log(`└${line}┘\n`);
console.log('Saved to orgs.json. Keep this file secret — never commit it.\n');
