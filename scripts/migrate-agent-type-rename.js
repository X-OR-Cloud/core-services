/**
 * Migration: Rename agent type values
 *
 * Changes:
 *   hosted     → assistant
 *   managed    → engineer
 *   autonomous → engineer
 *
 * Also renames settings keys:
 *   hosted_maxConcurrency    → assistant_maxConcurrency
 *   hosted_idleTimeoutMs     → assistant_idleTimeoutMs
 *   hosted_reconnectDelayMs  → assistant_reconnectDelayMs
 *   hosted_maxSteps          → assistant_maxSteps
 *   hosted_heartbeatIntervalMs → assistant_heartbeatIntervalMs
 *
 * Usage:
 *   MONGODB_URI=mongodb://localhost:27017 node scripts/migrate-agent-type-rename.js
 *   MONGODB_URI=mongodb://localhost:27017 node scripts/migrate-agent-type-rename.js --dry-run
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME_PREFIX = process.env.DB_NAME_PREFIX || 'hydrabyte-';
const DB_NAME = `${DB_NAME_PREFIX}aiwm`;
const DRY_RUN = process.argv.includes('--dry-run');

const TYPE_MAP = {
  hosted: 'assistant',
  managed: 'engineer',
  autonomous: 'engineer',
};

const SETTINGS_KEY_MAP = {
  hosted_maxConcurrency: 'assistant_maxConcurrency',
  hosted_idleTimeoutMs: 'assistant_idleTimeoutMs',
  hosted_reconnectDelayMs: 'assistant_reconnectDelayMs',
  hosted_maxSteps: 'assistant_maxSteps',
  hosted_heartbeatIntervalMs: 'assistant_heartbeatIntervalMs',
};

async function migrate() {
  console.log(`[migrate-agent-type-rename] Connecting to ${MONGODB_URI}/${DB_NAME}...`);
  if (DRY_RUN) console.log('[migrate-agent-type-rename] DRY RUN mode — no changes will be written');

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const agents = db.collection('agents');

  // ── 1. Migrate type field ───────────────────────────────────────────────
  for (const [oldType, newType] of Object.entries(TYPE_MAP)) {
    const count = await agents.countDocuments({ type: oldType, isDeleted: { $ne: true } });
    console.log(`  type '${oldType}' → '${newType}': ${count} active agent(s)`);

    const countDeleted = await agents.countDocuments({ type: oldType, isDeleted: true });
    if (countDeleted > 0) {
      console.log(`  type '${oldType}' → '${newType}': ${countDeleted} deleted agent(s) (will also be migrated)`);
    }

    if (!DRY_RUN && (count + countDeleted) > 0) {
      const result = await agents.updateMany(
        { type: oldType },
        { $set: { type: newType } }
      );
      console.log(`  ✓ Updated ${result.modifiedCount} agent(s) type '${oldType}' → '${newType}'`);
    }
  }

  // ── 2. Migrate settings keys (hosted_* → assistant_*) ──────────────────
  // Only applies to agents with type=assistant (formerly hosted)
  const assistantAgents = await agents
    .find({ type: 'assistant' })
    .project({ _id: 1, settings: 1 })
    .toArray();

  let settingsUpdated = 0;
  for (const agent of assistantAgents) {
    if (!agent.settings || typeof agent.settings !== 'object') continue;

    const newSettings = { ...agent.settings };
    let changed = false;

    for (const [oldKey, newKey] of Object.entries(SETTINGS_KEY_MAP)) {
      if (oldKey in newSettings) {
        newSettings[newKey] = newSettings[oldKey];
        delete newSettings[oldKey];
        changed = true;
      }
    }

    if (changed) {
      settingsUpdated++;
      if (!DRY_RUN) {
        await agents.updateOne(
          { _id: agent._id },
          { $set: { settings: newSettings } }
        );
      }
    }
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] Would update settings keys for ${settingsUpdated} assistant agent(s)`);
  } else {
    console.log(`  ✓ Updated settings keys for ${settingsUpdated} assistant agent(s)`);
  }

  // ── 3. Summary ─────────────────────────────────────────────────────────
  console.log('\n[migrate-agent-type-rename] Final counts:');
  for (const newType of ['assistant', 'engineer']) {
    const count = await agents.countDocuments({ type: newType });
    console.log(`  type='${newType}': ${count} total agent(s)`);
  }

  await client.close();
  console.log('[migrate-agent-type-rename] Done.');
}

migrate().catch((err) => {
  console.error('[migrate-agent-type-rename] ERROR:', err);
  process.exit(1);
});
