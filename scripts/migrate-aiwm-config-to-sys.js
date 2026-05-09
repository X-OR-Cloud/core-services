#!/usr/bin/env node
/**
 * Migrate `core_aiwm.configurations` → `core_sys.settings`
 *
 * Usage:
 *   node scripts/migrate-aiwm-config-to-sys.js --dry-run
 *   node scripts/migrate-aiwm-config-to-sys.js --apply
 *
 * Behavior:
 *   - Reads all non-deleted documents from `core_aiwm.configurations`.
 *   - Maps each to the new `core_sys.settings` schema (preserves key, value, scope, owner, timestamps).
 *   - Sets `sensitive` flag from SETTING_METADATA registry (so the migration is metadata-driven).
 *   - Skips key+scope+orgId combos that already exist in `core_sys.settings` (safe re-run).
 *   - Reports total / created / skipped / errors at the end.
 *
 * Ref: docs/sys/PLAN_v1.md Phase P5 (this script is the skeleton; full validation + run lives in P5).
 *
 * STATUS: SKELETON ONLY. P1.8 — wired and runnable but not yet exercised against production data.
 */

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isApply = args.includes('--apply');

if (!isDryRun && !isApply) {
  console.error('Usage: node scripts/migrate-aiwm-config-to-sys.js (--dry-run | --apply)');
  process.exit(1);
}

if (isDryRun && isApply) {
  console.error('Error: --dry-run and --apply are mutually exclusive');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------
const dotenvPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(dotenvPath)) {
  require('dotenv').config({ path: dotenvPath });
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI is required (load from .env or shell env)');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Mongo
// ---------------------------------------------------------------------------
const { MongoClient } = require('mongodb');

async function main() {
  const client = new MongoClient(MONGODB_URI);
  console.log(`[migrate] Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`[migrate] Connecting to Mongo...`);
  await client.connect();

  const aiwmDb = client.db('core_aiwm');
  const sysDb = client.db('core_sys');
  const aiwmColl = aiwmDb.collection('configurations');
  const sysColl = sysDb.collection('settings');

  try {
    // Read source
    const sourceDocs = await aiwmColl.find({ isDeleted: { $ne: true } }).toArray();
    console.log(`[migrate] Source: ${sourceDocs.length} configurations in core_aiwm`);

    let created = 0;
    let skipped = 0;
    const errors = [];

    for (const doc of sourceDocs) {
      try {
        // Check if already migrated
        const filter = {
          key: doc.key,
          scope: doc.scope,
          isDeleted: false,
          'owner.orgId': doc.owner?.orgId || '',
        };
        const existing = await sysColl.findOne(filter);
        if (existing) {
          skipped++;
          continue;
        }

        // Build new doc — preserve original timestamps + audit fields
        // Note: `sensitive` flag is NOT set here at the script level. Instead,
        // when sys-app boots and runs `initializeAllInternal`, the sensitive
        // flag will be derived from SETTING_METADATA. For migrated docs from
        // aiwm.configuration, we conservatively default `sensitive=false` and
        // rely on a follow-up `bulk-set-sensitive-flags` script (or running
        // the sys-app's metadata sync routine) to flip flags.
        //
        // Alternative: import SETTING_METADATA here. Skipped for skeleton —
        // P5 will decide whether to embed metadata in the script or call a
        // sys-app endpoint to apply flags after migration.
        const newDoc = {
          key: doc.key,
          value: doc.value || '',
          scope: doc.scope || 'org',
          sensitive: false,
          encrypted: false,
          keyVersion: 1,
          notes: doc.notes,
          owner: doc.owner || { orgId: '', userId: '', groupId: '', agentId: '', appId: '' },
          isDeleted: false,
          deletedAt: null,
          createdBy: doc.createdBy,
          updatedBy: doc.updatedBy,
          createdAt: doc.createdAt || new Date(),
          updatedAt: doc.updatedAt || new Date(),
        };

        if (isApply) {
          await sysColl.insertOne(newDoc);
        }
        created++;
      } catch (err) {
        errors.push({ key: doc.key, error: err.message });
      }
    }

    console.log('[migrate] Result:');
    console.log(`  - total: ${sourceDocs.length}`);
    console.log(`  - created: ${created}${isDryRun ? ' (dry-run, no actual writes)' : ''}`);
    console.log(`  - skipped: ${skipped} (already present)`);
    if (errors.length) {
      console.log(`  - errors: ${errors.length}`);
      console.log(JSON.stringify(errors, null, 2));
    }
    console.log('[migrate] Done.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('[migrate] Fatal error:', err);
  process.exit(1);
});
