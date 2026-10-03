// Read-only export. Pause writes in the old app before the final export.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

const [outputPath, bucketName] = process.argv.slice(2);
if (!outputPath || !bucketName || !process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Uso: GOOGLE_APPLICATION_CREDENTIALS=arquivo.json node export.mjs DIRETORIO_NOVO BUCKET');
const output = resolve(outputPath);
await mkdir(output, { recursive: false, mode: 0o700 });
await mkdir(resolve(output, 'files'), { mode: 0o700 });
initializeApp({ credential: applicationDefault(), storageBucket: bucketName });
const db = getFirestore();
const authUsers = new Map();
let pageToken;
do {
  const page = await getAuth().listUsers(1000, pageToken);
  for (const user of page.users) authUsers.set(user.uid, { disabled: user.disabled, email: user.email || '', googleId: user.providerData.find(p => p.providerId === 'google.com')?.uid || null });
  pageToken = page.pageToken;
} while (pageToken);
const normalize = value => {
  if (value?.toDate instanceof Function) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, normalize(v)]));
  return value;
};
const result = { version: 1, exportedAt: new Date().toISOString(), users: [], managements: [], records: [], attachments: [] };
for (const doc of (await db.collection('users').get()).docs) {
  const auth = authUsers.get(doc.id);
  if (!auth) throw new Error(`Perfil sem usuário Authentication: ${doc.id}. Corrija antes de migrar.`);
  const data = normalize(doc.data());
  result.users.push({ id: doc.id, data: { ...data, email: (auth.email || data.email).toLowerCase(), active: data.active === true && !auth.disabled }, googleId: auth.googleId });
}
const attachmentMap = new Map();
for (const doc of (await db.collection('managements').get()).docs) {
  result.managements.push({ id: doc.id, data: normalize(doc.data()) });
  for (const kind of ['cards','transactions']) {
    for (const record of (await doc.ref.collection(kind).get()).docs) {
      const data = normalize(record.data());
      if (data.attachment) {
        const source = data.attachment.path;
        if (!source || !source.startsWith(`managements/${doc.id}/receipts/`)) throw new Error(`Comprovante com caminho inesperado: ${record.id}`);
        if (!attachmentMap.has(source)) {
          const id = randomUUID(); const file = resolve(output, 'files', id);
          await getStorage().bucket().file(source).download({ destination: file });
          const bytes = await readFile(file);
          const attachment = { id, managementId: doc.id, name: data.attachment.name, type: data.attachment.type, file: id, sha256: createHash('sha256').update(bytes).digest('hex'), sourcePath: source };
          result.attachments.push(attachment); attachmentMap.set(source, attachment);
        }
        const attachment = attachmentMap.get(source);
        data.attachment = { name: attachment.name, type: attachment.type, path: attachment.id, url: `/api/attachments/${attachment.id}` };
      }
      result.records.push({ id: record.id, managementId: doc.id, kind, data });
    }
  }
}
await writeFile(resolve(output, 'manifest.json'), JSON.stringify(result, null, 2), { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ users: result.users.length, managements: result.managements.length, cards: result.records.filter(r => r.kind === 'cards').length, transactions: result.records.filter(r => r.kind === 'transactions').length, attachments: result.attachments.length }));
console.log('Exportação concluída. Senhas não foram exportadas. Contas Google vinculadas foram preservadas.');
