import { readFile, mkdir, copyFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openStore } from './store.mjs';
import { email } from './domain.mjs';
import { pathToFileURL } from 'node:url';

export async function importExport(sourcePath, dataDir) {
  const source = resolve(sourcePath);
  const manifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1) throw new Error('Formato de exportação inválido.');
  const store = openStore(dataDir);
  const copied = [];
  try {
    for (const table of ['users','managements','records','attachments']) if (store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n) throw new Error('Importação exige banco vazio. Nenhum dado existente foi sobrescrito.');
    const users = new Set(manifest.users.map(u => u.id));
    if (!manifest.users.some(u => u.data.role === 'master' && u.data.active)) throw new Error('A exportação precisa ter um master ativo.');
    const mids = new Set(manifest.managements.map(m => m.id));
    for (const m of manifest.managements) {
      if (!users.has(m.data.ownerId) || !m.data.memberIds.includes(m.data.ownerId) || m.data.memberRoles[m.data.ownerId] !== 'owner') throw new Error(`Proprietário inválido: ${m.id}`);
      for (const uid of m.data.memberIds) if (!users.has(uid) || !['owner','editor','viewer'].includes(m.data.memberRoles[uid])) throw new Error(`Participante inválido: ${m.id}`);
    }
    const attachments = new Map(manifest.attachments.map(a => [a.id, a]));
    for (const r of manifest.records) {
      if (!mids.has(r.managementId) || !['cards','transactions'].includes(r.kind)) throw new Error('Registro sem gerenciamento.');
      if (r.data.attachment && attachments.get(r.data.attachment.path)?.managementId !== r.managementId) throw new Error('Comprovante ausente ou de outro gerenciamento.');
    }
    const uploads = resolve(dataDir, 'uploads'); await mkdir(uploads, { recursive: true });
    for (const a of manifest.attachments) {
      if (!/^[a-f0-9-]{36}$/.test(a.id) || a.file !== a.id || !mids.has(a.managementId)) throw new Error('Arquivo inválido.');
      const file = resolve(source, 'files', a.file);
      if (createHash('sha256').update(await readFile(file)).digest('hex') !== a.sha256) throw new Error(`Checksum divergente: ${a.id}`);
      const destination = resolve(uploads, a.id);
      await copyFile(file, destination, 1); copied.push(destination);
    }
    store.atomic(() => {
      for (const u of manifest.users) {
        const address = email(u.data.email);
        let password = null;
        if (u.firebasePassword) {
          const f = u.firebasePassword;
          if (f.algorithm !== 'SCRYPT' || !f.hash || !f.salt || !f.signerKey || !Number.isInteger(f.memoryCost) || f.memoryCost < 1 || f.memoryCost > 16 || !Number.isInteger(f.rounds) || f.rounds < 1 || f.rounds > 16) throw new Error('Parâmetros de senha não suportados.');
          password = `firebase:${Buffer.from(JSON.stringify(f)).toString('base64url')}`;
        }
        store.db.prepare('INSERT INTO users(id,email,password,google_id,data) VALUES (?,?,?,?,?)').run(u.id, address, password, u.googleId || null, JSON.stringify({ ...u.data, email: address }));
      }
      for (const m of manifest.managements) store.putManagement(m.id, m.data);
      for (const r of manifest.records) {
        const data = { ...r.data };
        if (data.attachment) data.attachment = { ...data.attachment, url: `/api/attachments/${data.attachment.path}` };
        // Firestore IDs are unique per collection; namespace them for the SQL primary key.
        store.putRecord(r.managementId, r.kind, `${r.managementId}_${r.kind}_${r.id}`, data);
      }
      // Replace card references with their namespaced IDs while preserving the original snapshots.
      for (const m of manifest.managements) for (const r of store.records(m.id, 'transactions')) if (r.cardId) {
        store.putRecord(m.id, 'transactions', r.id, { ...r, cardId: `${m.id}_cards_${r.cardId}` });
      }
      for (const a of manifest.attachments) store.db.prepare('INSERT INTO attachments VALUES (?,?,?,?,?)').run(a.id, a.managementId, a.name, a.type, a.file);
    });
    return Object.fromEntries(['users','managements','records','attachments'].map(table => [table, store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));
  } catch (error) {
    await Promise.all(copied.map(file => unlink(file)));
    throw error;
  } finally { store.db.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Uso: node server/import.mjs DIRETORIO_EXPORTADO [DIRETORIO_DADOS]');
  console.log(await importExport(process.argv[2], process.argv[3] || process.env.DATA_DIR || './data'));
}
