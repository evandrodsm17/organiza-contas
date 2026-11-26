import { decryptPortableBackup } from './portable-backup.mjs';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
const [input, output] = process.argv.slice(2);
if (!input || !output || !process.stdin.isTTY) {
  console.error('Uso: node server/decrypt-backup.mjs arquivo.ocbackup arquivo.tar.gz (terminal interativo)');
  process.exit(1);
}
const muted = new Writable({write(chunk,encoding,callback){callback();}});
const rl = createInterface({input:process.stdin,output:muted,terminal:true});
try {
  process.stderr.write('Senha do backup (oculta): ');
  const passphrase = await new Promise(resolve=>rl.question('',resolve));
  rl.close();
  process.stderr.write('\n');
  await decryptPortableBackup(input,output,passphrase);
  console.log('Backup autenticado e decifrado. Proteja o arquivo resultante.');
} catch(error) {
  console.error('Não foi possível recuperar o backup. Verifique a senha, o arquivo e o destino.');
  process.exitCode=1;
} finally {rl.close();}
