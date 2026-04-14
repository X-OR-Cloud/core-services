/**
 * Migration: knowledge_files → files
 *
 * Copies all documents from the legacy `knowledge_files` collection into the new
 * `files` collection with the new schema shape:
 *   - purpose: 'knowledge'
 *   - ownerRef: { kind: 'knowledge-collection', id: <legacy collectionId> }
 *   - storageKind: 'local'  (preserves existing local-disk files; run migrate-local-to-s3.ts after this)
 *   - storageKey: <legacy filePath>
 *
 * Idempotent: skips any source document whose _id already exists in `files`.
 *
 * Usage:
 *   MONGODB_URI=mongodb://... ts-node services/cbm/scripts/migrate-knowledge-files-to-files.ts [--dry-run]
 *
 * After verification, the legacy `knowledge_files` collection can be renamed to
 * `knowledge_files_backup` manually or dropped.
 */

import { MongoClient, ObjectId } from 'mongodb';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  const dbName = process.env.CBM_DB_NAME || 'hydrabyte-cbm';

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const source = db.collection('knowledge_files');
  const target = db.collection('files');

  const total = await source.countDocuments({});
  console.log(`[migrate] source=knowledge_files target=files total=${total} dryRun=${DRY_RUN}`);

  const cursor = source.find({});
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  while (await cursor.hasNext()) {
    const legacy = await cursor.next();
    if (!legacy) break;

    try {
      const exists = await target.findOne({ _id: legacy._id as ObjectId });
      if (exists) {
        skipped++;
        continue;
      }

      const migratedDoc: Record<string, unknown> = {
        _id: legacy._id,
        name: legacy.name,
        fileName: legacy.fileName,
        mimeType: legacy.mimeType,
        fileSize: legacy.fileSize ?? 0,
        storageKind: 'local',
        storageKey: legacy.filePath,
        purpose: 'knowledge',
        ownerRef: legacy.collectionId
          ? { kind: 'knowledge-collection', id: String(legacy.collectionId) }
          : undefined,
        rawContent: legacy.rawContent,
        embeddingStatus: legacy.embeddingStatus ?? 'pending',
        errorMessage: legacy.errorMessage,
        chunkCount: legacy.chunkCount ?? 0,
        owner: legacy.owner,
        createdBy: legacy.createdBy,
        updatedBy: legacy.updatedBy,
        isDeleted: legacy.isDeleted ?? false,
        deletedAt: legacy.deletedAt ?? null,
        metadata: legacy.metadata ?? {},
        createdAt: legacy.createdAt,
        updatedAt: legacy.updatedAt,
      };

      if (!DRY_RUN) {
        await target.insertOne(migratedDoc as any);
      }
      migrated++;

      if (migrated % 100 === 0) {
        console.log(`[migrate] progress migrated=${migrated} skipped=${skipped} errors=${errors}`);
      }
    } catch (err: any) {
      errors++;
      console.error(`[migrate] error for _id=${legacy._id}: ${err.message}`);
    }
  }

  console.log(`[migrate] DONE migrated=${migrated} skipped=${skipped} errors=${errors} dryRun=${DRY_RUN}`);
  await client.close();
}

main().catch((err) => {
  console.error('[migrate] FATAL:', err);
  process.exit(1);
});
