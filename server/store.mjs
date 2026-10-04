import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, scrypt, timingSafeEqual, createCipheriv } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 256)
    throw new Error('A senha deve ter entre 8 e 256 caracteres.');
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 4096) return false;
  if (encoded?.startsWith('firebase:')) {
    const config = JSON.parse(Buffer.from(encoded.slice(9), 'base64url').toString());
    if (config.algorithm !== 'SCRYPT' || !Number.isInteger(config.memoryCost) || config.memoryCost < 1 || config.memoryCost > 16 || !Number.isInteger(config.rounds) || config.rounds < 1 || config.rounds > 16) return false;
    const salt = Buffer.concat([Buffer.from(config.salt,'base64'),Buffer.from(config.saltSeparator || '','base64')]);
    // Firebase's documented modified scrypt: derived key then AES-256-CTR over signer key.
    // https://github.com/firebase/scrypt
    const derived = await derive(password,salt,64,{N:2 ** config.memoryCost,r:config.rounds,p:1,maxmem:256 * 1024 * 1024});
    try {
      const cipher = createCipheriv('aes-256-ctr',derived.subarray(0,32),Buffer.alloc(16));
      const actual = Buffer.concat([cipher.update(Buffer.from(config.signerKey,'base64')),cipher.final()]);
      const expected = Buffer.from(config.hash,'base64');
      return actual.length === expected.length && timingSafeEqual(actual,expected);
    } finally { derived.fill(0); }
  }
  const [salt, hex] = (encoded || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const key = await derive(password, salt, 64);
  const expected = Buffer.from(hex, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}
export function openStore(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(resolve(directory, 'organiza.sqlite'));
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password TEXT,
      google_id TEXT UNIQUE, data TEXT NOT NULL CHECK(json_valid(data))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS managements (
      id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data))
    );
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY, management_id TEXT NOT NULL REFERENCES managements(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('cards','transactions')), data TEXT NOT NULL CHECK(json_valid(data))
    );
    CREATE INDEX IF NOT EXISTS records_management ON records(management_id, kind);
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY, management_id TEXT NOT NULL REFERENCES managements(id) ON DELETE CASCADE,
      name TEXT NOT NULL, type TEXT NOT NULL, file TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT NOT NULL, management_id TEXT NOT NULL REFERENCES managements(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, subscription TEXT NOT NULL,
      created_at INTEGER NOT NULL, PRIMARY KEY(endpoint, management_id)
    );
    CREATE TABLE IF NOT EXISTS push_deliveries (
      endpoint TEXT NOT NULL, transaction_id TEXT NOT NULL, kind TEXT NOT NULL,
      delivered_at INTEGER NOT NULL, PRIMARY KEY(endpoint, transaction_id, kind)
    );
  `);
  const decode = row => row ? { ...JSON.parse(row.data), id: row.id } : null;
  return {
    db,
    user: id => decode(db.prepare('SELECT id,data FROM users WHERE id=?').get(id)),
    users: () => db.prepare('SELECT id,data FROM users ORDER BY json_extract(data,\'$.name\')').all().map(decode),
    management: id => decode(db.prepare('SELECT * FROM managements WHERE id=?').get(id)),
    managements: () => db.prepare('SELECT * FROM managements').all().map(decode),
    putManagement: (id, data) => db.prepare('INSERT INTO managements VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(id, JSON.stringify(data)),
    records: (mid, kind) => db.prepare('SELECT id,data FROM records WHERE management_id=? AND kind=?').all(mid, kind).map(decode),
    record: (mid, kind, id) => decode(db.prepare('SELECT id,data FROM records WHERE management_id=? AND kind=? AND id=?').get(mid, kind, id)),
    putRecord: (mid, kind, id, data) => db.prepare('INSERT INTO records VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE management_id=excluded.management_id AND kind=excluded.kind').run(id, mid, kind, JSON.stringify(data)),
    atomic(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const result = fn(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
}
