import { readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { attachmentKey, encryptAttachment, isEncryptedAttachment } from './attachment-crypto.mjs';

const dataDir = resolve(process.argv[2] || process.env.DATA_DIR || './data');
const uploads = resolve(dataDir, 'uploads');
const key = attachmentKey();
const entries = await readdir(uploads, { withFileTypes: true });
let encrypted = 0;

for (const entry of entries) {
  if (!entry.isFile() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
  const file = resolve(uploads, entry.name);
  const content = await readFile(file);
  if (isEncryptedAttachment(content)) continue;
  const temporary = resolve(uploads, `.${entry.name}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, encryptAttachment(content, key), { mode: 0o600, flag: 'wx' });
    await rename(temporary, file);
    encrypted++;
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
console.log(JSON.stringify({ ok: true, encrypted, alreadyEncrypted: entries.filter(entry => entry.isFile()).length - encrypted }));
