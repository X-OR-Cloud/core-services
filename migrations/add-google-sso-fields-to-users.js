// Migration: add-google-sso-fields-to-users
// Adds provider, googleId, and avatarUrl fields to existing users
// and creates a sparse unique index on googleId.

db.users.updateMany(
  { provider: { $exists: false } },
  { $set: { provider: 'local', googleId: null, avatarUrl: null } }
);

db.users.createIndex(
  { googleId: 1 },
  { sparse: true, unique: true, name: 'idx_googleId_sparse' }
);

const total = db.users.countDocuments();
const migrated = db.users.countDocuments({ provider: { $exists: true } });
print(`Migration check: ${migrated}/${total} users migrated`);
