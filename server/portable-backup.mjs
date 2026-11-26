import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, statSync, lstatSync, rmSync } from 'node:fs';
import { createReadStream, createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes, scrypt, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';

const derive = promisify(scrypt);
const magic = Buffer.from('OCBACK01');
const headerSize = 8 + 16 + 12;
const limit = 512 * 1024 * 1024;
const problem = (message, status = 409) => Object.assign(new Error(message), { status });
const keyFor = (passphrase, salt) => derive(passphrase, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export function validateBackupPassphrase(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 256) throw problem('A senha do backup deve ter entre 12 e 256 caracteres.', 400);
}
function runTar(dir, archive) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-czf', archive, '-C', dir, '.'], { stdio: ['ignore','ignore','ignore'] });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Falha ao compactar backup.')));
  });
}
export async function createPortableBackup({ db, uploads, encryptionKey, passphrase }) {
  validateBackupPassphrase(passphrase);
  const work = mkdtempSync(join(tmpdir(), 'organiza-export-'));
  const data = join(work, 'data');
  const snapshot = join(data, 'organiza.sqlite');
  const archive = join(work, 'backup.tar.gz');
  const encrypted = join(work, 'backup.ocbackup');
  try {
    mkdirSync(data, { mode: 0o700 });
    mkdirSync(join(data, 'uploads'), { mode: 0o700 });
    // Synchronous snapshot and file copies keep the single Node instance from
    // interleaving mutations. A missing file aborts instead of exporting an incomplete backup.
    db.prepare('VACUUM INTO ?').run(snapshot);
    const copy = new DatabaseSync(snapshot);
    try {
      const integrity = copy.prepare('PRAGMA quick_check').all();
      if (integrity.some(row => Object.values(row)[0] !== 'ok')) throw problem('Banco inconsistente. Backup cancelado.');
      if (copy.prepare('PRAGMA foreign_key_check').all().length) throw problem('Existem referências inválidas no banco.');
      copy.exec('DELETE FROM sessions; PRAGMA journal_mode=DELETE;');
      const files = copy.prepare('SELECT file FROM attachments').all();
      let bytes = statSync(snapshot).size;
      if (bytes > limit) throw problem('Base acima do limite da exportação web. Utilize o backup da VPS.', 413);
      for (const {file} of files) {
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(file)) throw problem('Nome de comprovante inválido.');
        const source = join(uploads, file);
        let info;
        try { info = lstatSync(source); } catch { throw problem('Existe um comprovante ausente. Backup cancelado.'); }
        if (!info.isFile()) throw problem('Comprovante inválido. Backup cancelado.');
        bytes += info.size;
        if (bytes > limit) throw problem('Base acima do limite de 512 MB da exportação web. Utilize o backup da VPS.', 413);
        copyFileSync(source, join(data, 'uploads', file));
      }
      writeFileSync(join(data, 'backup-manifest.json'), JSON.stringify({
        format: 1, createdAt: new Date().toISOString(), revision: process.env.APP_REVISION || 'local',
        attachmentCount: files.length, sessionsExcluded: true
      }, null, 2), { mode: 0o600 });
    } finally { copy.close(); }
    // This secret exists only inside the private temporary directory and encrypted export.
    writeFileSync(join(data, 'attachment-key.txt'), encryptionKey.toString('base64') + '\n', { mode: 0o600 });
    await runTar(data, archive);
    const salt = randomBytes(16), iv = randomBytes(12);
    const header = Buffer.concat([magic,salt,iv]);
    const key = await keyFor(passphrase,salt);
    try {
      const cipher = createCipheriv('aes-256-gcm',key,iv);
      cipher.setAAD(header);
      writeFileSync(encrypted,header,{mode:0o600});
      await pipeline(createReadStream(archive),cipher,createWriteStream(encrypted,{flags:'a'}));
      const f = await open(encrypted,'a');
      try { await f.writeFile(cipher.getAuthTag()); } finally { await f.close(); }
    } finally { key.fill(0); }
    rmSync(data,{recursive:true,force:true});
    rmSync(archive,{force:true});
    return { path:encrypted, size:statSync(encrypted).size, cleanup:()=>rmSync(work,{recursive:true,force:true}) };
  } catch (error) {
    rmSync(work,{recursive:true,force:true});
    throw error;
  }
}

export async function decryptPortableBackup(input, output, passphrase) {
  validateBackupPassphrase(passphrase);
  const file = await open(input,'r');
  let handle;
  let created = false;
  try {
    const {size} = await file.stat();
    if (size <= headerSize + 16) throw new Error('Arquivo inválido.');
    const header = Buffer.alloc(headerSize), tag = Buffer.alloc(16);
    await file.read(header,0,header.length,0);
    await file.read(tag,0,tag.length,size-16);
    if (!header.subarray(0,8).equals(magic)) throw new Error('Formato desconhecido.');
    const key = await keyFor(passphrase,header.subarray(8,24));
    try {
      const decipher = createDecipheriv('aes-256-gcm',key,header.subarray(24));
      decipher.setAAD(header); decipher.setAuthTag(tag);
      handle = await open(output,'wx',0o600); created = true;
      await pipeline(createReadStream(input,{start:headerSize,end:size-17}),decipher,handle.createWriteStream({autoClose:false}));
    } finally { key.fill(0); }
  } catch (error) {
    if (handle) { await handle.close(); handle = undefined; }
    if (created) rmSync(output,{force:true});
    throw error;
  } finally {
    if (handle) await handle.close();
    await file.close();
  }
}
