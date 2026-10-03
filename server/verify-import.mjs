import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { openStore } from './store.mjs';

const [sourcePath, directory = process.env.DATA_DIR || './data'] = process.argv.slice(2);
if (!sourcePath) throw new Error('Uso: node server/verify-import.mjs DIRETORIO_EXPORTADO [DIRETORIO_DADOS]');
const manifest = JSON.parse(await readFile(resolve(sourcePath,'manifest.json'),'utf8'));
const store = openStore(directory);
try {
  assert.equal(store.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  for (const table of ['users','managements','records','attachments']) assert.equal(store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,manifest[table].length,`Contagem divergente: ${table}`);
  for (const u of manifest.users) {
    assert.deepEqual(store.user(u.id),{...u.data,email:u.data.email.toLowerCase(),id:u.id});
    const auth = store.db.prepare('SELECT password,google_id FROM users WHERE id=?').get(u.id);
    assert.equal(auth.google_id,u.googleId || null);
    if (u.firebasePassword) assert.deepEqual(JSON.parse(Buffer.from(auth.password.slice(9),'base64url').toString()),u.firebasePassword);
  }
  for (const m of manifest.managements) assert.deepEqual(store.management(m.id),{...m.data,id:m.id});
  for (const r of manifest.records) {
    const id = `${r.managementId}_${r.kind}_${r.id}`;
    const expected = {...r.data,id};
    if (r.kind === 'transactions' && expected.cardId) expected.cardId = `${r.managementId}_cards_${expected.cardId}`;
    if (expected.attachment) expected.attachment = {...expected.attachment,url:`/api/attachments/${expected.attachment.path}`};
    assert.deepEqual(store.record(r.managementId,r.kind,id),expected);
  }
  for (const a of manifest.attachments) {
    assert.equal(createHash('sha256').update(await readFile(resolve(directory,'uploads',a.id))).digest('hex'),a.sha256);
  }
  console.log(JSON.stringify({ok:true,users:manifest.users.length,managements:manifest.managements.length,cards:manifest.records.filter(r=>r.kind==='cards').length,transactions:manifest.records.filter(r=>r.kind==='transactions').length,attachments:manifest.attachments.length,integrity:'ok'}));
} catch {
  // Never print assert diffs containing financial data or password hashes.
  console.error('A conferência integral falhou. Revise a importação em ambiente privado.');
  process.exitCode = 1;
} finally { store.db.close(); }
