import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, createReadStream, createWriteStream } from 'node:fs';
import { rename, rm, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Only implements the D1/R2 operations used by FiveGen. Node's SQLite driver
// executes each batch synchronously in one transaction, preserving credit/quota
// atomicity. Media never lives in the public/ or build directories.
export function createStorage(directory, migrations = resolve('drizzle')) {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true });
  const media = join(root, 'media');
  mkdirSync(media, { recursive: true });
  const sqlite = new DatabaseSync(join(root, 'fivegen.sqlite'));
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  try {
    sqlite.exec('CREATE TABLE IF NOT EXISTS fivegen_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)');
    for (const name of readdirSync(migrations).filter(f => /^\d+_.*\.sql$/.test(f)).sort()) {
      const sql = readFileSync(join(migrations, name), 'utf8').replace(/\r\n/g, '\n');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const applied = sqlite.prepare('SELECT checksum FROM fivegen_migrations WHERE name=?').get(name);
      if (applied) {
        if (applied.checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        sqlite.exec(sql);
        sqlite.prepare('INSERT INTO fivegen_migrations VALUES (?,?,?)').run(name, checksum, Date.now());
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
    // These tables belong to Render sign-in, independently of the Sites schema.
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS render_auth_flows (
        hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, verifier TEXT NOT NULL,
        nonce TEXT NOT NULL, return_to TEXT NOT NULL, expires INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS render_sessions (
        hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT NOT NULL,
        name TEXT NOT NULL, expires INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS render_sessions_expiry ON render_sessions(expires);
    `);
  } catch (error) {
    sqlite.close();
    throw error;
  }

  function prepare(sql, values = []) {
    const statement = sqlite.prepare(sql);
    return {
      bind: (...args) => prepare(sql, args),
      async first(column) {
        const row = statement.get(...values);
        return row ? (column === undefined ? row : row[column]) : null;
      },
      async all() { return { success: true, results: statement.all(...values), meta: {} }; },
      async run() { return this.runSync(); },
      runSync() {
        const result = statement.run(...values);
        return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
    };
  }
  const DB = {
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => statement.runSync());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const objectPath = key => {
    if (typeof key !== 'string' || !key.length || key.length > 2048) throw new Error('Invalid object key');
    // Hash keys to prevent traversal, Windows path quirks, and unsafe filenames.
    return join(media, createHash('sha256').update(key).digest('hex'));
  };
  const BUCKET = {
    async put(key, body) {
      const destination = objectPath(key), temporary = `${destination}.${randomUUID()}.tmp`;
      let size = 0;
      const limit = new Transform({ transform(chunk, encoding, callback) {
        size += chunk.length;
        callback(size > 100 * 1024 * 1024 ? new Error('Media exceeds 100 MB') : null, chunk);
      } });
      try {
        const input = body?.getReader ? Readable.fromWeb(body) : Readable.from([body]);
        await pipeline(input, limit, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
        await rename(temporary, destination);
        return { key, size };
      } finally { await rm(temporary, { force: true }); }
    },
    async delete(key) { await rm(objectPath(key), { force: true }); },
    async get(key, options) {
      const file = objectPath(key);
      try {
        const info = await stat(file);
        const range = options?.range;
        return { size: info.size, body: Readable.toWeb(createReadStream(file, range ? { start: range.offset, end: Math.min(info.size - 1, range.offset + range.length - 1) } : undefined)) };
      } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
  };
  return { DB, BUCKET, sqlite, root, close: () => sqlite.close() };
}

const singleton = Symbol.for('fivegen.render.storage');
export function getStorage() {
  if (!process.env.FIVEGEN_DATA_DIR) throw new Error('FIVEGEN_DATA_DIR must point to persistent storage');
  return globalThis[singleton] ??= createStorage(process.env.FIVEGEN_DATA_DIR);
}
