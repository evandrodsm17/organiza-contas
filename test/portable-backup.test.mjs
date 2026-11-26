import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../server/store.mjs';
import { createPortableBackup, decryptPortableBackup } from '../server/portable-backup.mjs';

test('portable backup preserves database and attachments, strips sessions, rejects incorrect passwords', async () => {
  const dir=mkdtempSync(join(tmpdir(),'oc-backup-test-'));
  const store=openStore(dir);
  let backup;
  try {
    const uploads=join(dir,'uploads'); mkdirSync(uploads);
    store.db.prepare('INSERT INTO users(id,email,password,data) VALUES (?,?,?,?)').run('u','test@example.invalid','test-hash',JSON.stringify({name:'Test',role:'master'}));
    store.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run('token','u',Date.now()+60000);
    store.putManagement('m',{name:'Test',ownerId:'u',memberIds:['u']});
    store.db.prepare('INSERT INTO attachments VALUES (?,?,?,?,?)').run('a','m','test.pdf','application/pdf','a');
    writeFileSync(join(uploads,'a'),'fixture');
    const secret=Buffer.alloc(32,7);
    backup=await createPortableBackup({db:store.db,uploads,encryptionKey:secret,passphrase:'test-backup-passphrase'});
    assert.equal(readFileSync(backup.path).subarray(0,8).toString(),'OCBACK01');
    const bad=join(dir,'bad.tar.gz');
    await assert.rejects(decryptPortableBackup(backup.path,bad,'incorrect-passphrase'));
    assert.equal(existsSync(bad),false);
    const archive=join(dir,'good.tar.gz');
    await decryptPortableBackup(backup.path,archive,'test-backup-passphrase');
    const restore=join(dir,'restore');mkdirSync(restore);
    execFileSync('tar',['-xzf',archive,'-C',restore]);
    assert.equal(readFileSync(join(restore,'uploads','a'),'utf8'),'fixture');
    assert.equal(readFileSync(join(restore,'attachment-key.txt'),'utf8').trim(),secret.toString('base64'));
    const restored=new DatabaseSync(join(restore,'organiza.sqlite'));
    try {
      assert.equal(restored.prepare('SELECT count(*) AS n FROM users').get().n,1);
      assert.equal(restored.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
      assert.equal(restored.prepare('SELECT count(*) AS n FROM attachments').get().n,1);
    } finally {restored.close();}
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM sessions').get().n,1);
    rmSync(join(uploads,'a'));
    await assert.rejects(createPortableBackup({db:store.db,uploads,encryptionKey:secret,passphrase:'test-backup-passphrase'}),/ausente/);
  } finally {backup?.cleanup();store.db.close();rmSync(dir,{recursive:true,force:true});}
});
