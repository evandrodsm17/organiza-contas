import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [outputPath] = process.argv.slice(2);
if (!outputPath || !process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Informe o diretório exportado e GOOGLE_APPLICATION_CREDENTIALS.');
const manifestPath = resolve(outputPath, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const credential = applicationDefault();
const app = initializeApp({credential});
const serviceAccount = JSON.parse(await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
const token = (await credential.getAccessToken()).access_token;
const response = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(serviceAccount.project_id)}/config`, {headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
if (!response.ok) throw new Error(`Leitura da configuração de autenticação falhou: HTTP ${response.status}.`);
const config = await response.json();
const hashConfig = config.signIn?.hashConfig;
if (hashConfig?.algorithm !== 'SCRYPT' || !hashConfig.signerKey) throw new Error('A chave não permite ler os parâmetros SCRYPT. Use o procedimento de definição de senha local.');
let pageToken; let withPassword = 0;
do {
  const page = await getAuth(app).listUsers(1000, pageToken);
  for (const user of page.users) {
    const entry = manifest.users.find(u => u.id === user.uid);
    if (entry && user.passwordHash && user.passwordSalt) {
      entry.firebasePassword = {hash:user.passwordHash,salt:user.passwordSalt,...hashConfig};
      withPassword++;
    }
  }
  pageToken = page.pageToken;
} while(pageToken);
await writeFile(manifestPath,JSON.stringify(manifest,null,2),{mode:0o600});
console.log(JSON.stringify({users:manifest.users.length,passwordsPreserved:withPassword,googleOnly:manifest.users.filter(u=>!u.firebasePassword&&u.googleId).length,withoutLogin:manifest.users.filter(u=>!u.firebasePassword&&!u.googleId).length}));
