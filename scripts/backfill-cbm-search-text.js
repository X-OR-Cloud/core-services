#!/usr/bin/env node
/**
 * Backfill `searchText` for existing Product and Contact documents in CBM.
 *
 * Usage:
 *   node scripts/backfill-cbm-search-text.js
 *
 * Requires MONGODB_URI in env (or .env in repo root).
 *
 * Idempotent — safe to re-run. Only touches docs where searchText is missing
 * or out-of-date with current name/code/email/phone/notes/tags.
 */
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    });
}

function normalizeSearchText(input) {
  if (!input) return '';
  return String(input)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildProductSearchText(doc) {
  return [normalizeSearchText(doc.name), normalizeSearchText(doc.code)]
    .filter(Boolean)
    .join(' ');
}

function buildContactSearchText(doc) {
  const parts = [
    normalizeSearchText(doc.name),
    normalizeSearchText(doc.email),
    normalizeSearchText(doc.phone),
    normalizeSearchText(doc.notes),
    ...(Array.isArray(doc.tags) ? doc.tags.map(normalizeSearchText) : []),
  ];
  return parts.filter(Boolean).join(' ');
}

async function backfill(coll, builder, label) {
  const cursor = coll.find({}, { projection: { name: 1, code: 1, email: 1, phone: 1, notes: 1, tags: 1, searchText: 1 } });
  let scanned = 0;
  let updated = 0;
  const ops = [];
  for await (const doc of cursor) {
    scanned++;
    const next = builder(doc);
    if (next !== doc.searchText) {
      ops.push({
        updateOne: { filter: { _id: doc._id }, update: { $set: { searchText: next } } },
      });
      if (ops.length >= 500) {
        const res = await coll.bulkWrite(ops, { ordered: false });
        updated += res.modifiedCount || 0;
        ops.length = 0;
      }
    }
  }
  if (ops.length) {
    const res = await coll.bulkWrite(ops, { ordered: false });
    updated += res.modifiedCount || 0;
  }
  console.log(`[${label}] scanned=${scanned} updated=${updated}`);
}

async function main() {
  loadEnv();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }
  const dbName = process.env.CBM_DB_NAME || 'core_cbm';
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(dbName);
    await backfill(db.collection('products'), buildProductSearchText, 'products');
    await backfill(db.collection('contacts'), buildContactSearchText, 'contacts');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
