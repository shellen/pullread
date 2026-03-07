// ABOUTME: SQLite-backed record storage for the research knowledge graph.
// ABOUTME: Uses bun:sqlite (mapped to better-sqlite3 in Jest via moduleNameMapper).

import { Database } from 'bun:sqlite';

const BASE32_CHARS = '234567abcdefghijklmnopqrstuvwxyz';
let lastTimestamp = 0;
let clockId = Math.floor(Math.random() * 1024);

function generateTid(): string {
  let now = Date.now() * 1000;
  if (now <= lastTimestamp) {
    now = lastTimestamp + 1;
  }
  lastTimestamp = now;
  clockId = (clockId + 1) & 0x3ff;

  const combined = BigInt(now) * 1024n + BigInt(clockId);
  let encoded = '';
  let val = combined;
  for (let i = 0; i < 13; i++) {
    encoded = BASE32_CHARS[Number(val & 31n)] + encoded;
    val >>= 5n;
  }
  return encoded;
}

interface PdsRecord {
  collection: string;
  rkey: string;
  value: any;
  indexedAt: string;
}

function parseRow(row: any): PdsRecord | null {
  if (!row) return null;
  return {
    collection: row.collection,
    rkey: row.rkey,
    value: JSON.parse(row.record),
    indexedAt: row.indexedAt,
  };
}

export function createPDS({ db: dbPath = ':memory:', did = 'did:web:localhost' } = {}) {
  const db = new Database(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      collection TEXT NOT NULL,
      rkey TEXT NOT NULL,
      record JSON NOT NULL,
      indexedAt TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (collection, rkey)
    )
  `);

  const stmts = {
    put: db.prepare('INSERT OR REPLACE INTO records (collection, rkey, record) VALUES (?, ?, ?)'),
    get: db.prepare('SELECT collection, rkey, record, indexedAt FROM records WHERE collection = ? AND rkey = ?'),
    list: db.prepare('SELECT collection, rkey, record, indexedAt FROM records WHERE collection = ? ORDER BY rkey ASC'),
    del: db.prepare('DELETE FROM records WHERE collection = ? AND rkey = ?'),
  };

  return {
    did,
    _db: db,

    putRecord(collection: string, rkey: string | null, record: any) {
      const key = rkey || generateTid();
      stmts.put.run(collection, key, JSON.stringify(record));
      return { collection, rkey: key, value: record };
    },

    getRecord(collection: string, rkey: string) {
      return parseRow(stmts.get.get(collection, rkey));
    },

    listRecords(collection: string): PdsRecord[] {
      return stmts.list.all(collection).map(parseRow).filter((r): r is PdsRecord => r !== null);
    },

    deleteRecord(collection: string, rkey: string) {
      stmts.del.run(collection, rkey);
    },

    query(collection: string, opts: { where?: Record<string, any>; limit?: number } = {}) {
      const { where = {}, limit } = opts;
      const conditions = ['collection = ?'];
      const params: any[] = [collection];

      for (const [field, val] of Object.entries(where)) {
        conditions.push("json_extract(record, '$.' || ?) = ?");
        params.push(field, typeof val === 'number' ? val : String(val));
      }

      let sql = `SELECT collection, rkey, record, indexedAt FROM records WHERE ${conditions.join(' AND ')} ORDER BY rkey ASC`;
      if (limit) {
        sql += ' LIMIT ?';
        params.push(limit);
      }

      return db.prepare(sql).all(...params).map(parseRow).filter((r): r is PdsRecord => r !== null);
    },

    close() {
      db.close();
    },
  };
}
