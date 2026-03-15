/**
 * Build MongoDB connection URI with database name.
 * If MONGODB_AUTH_SOURCE is set, appends ?authSource=<value>.
 * Falls back gracefully when env vars are absent (e.g. local dev without auth).
 */
export function buildMongoUri(dbName: string): string {
  const base = process.env.MONGODB_URI ?? '';
  const authSource = process.env.MONGODB_AUTH_SOURCE;
  const suffix = authSource ? `?authSource=${authSource}` : '';
  return `${base}/${dbName}${suffix}`;
}
