import { randomUUID } from 'node:crypto';
import { openStore, hashPassword } from './store.mjs';
import { email, text } from './domain.mjs';

const [command, inputEmail, inputName] = process.argv.slice(2);
if (!['create-master','set-password'].includes(command) || !inputEmail) {
  console.error('Uso: npm run admin -- create-master email nome | set-password email\nA senha é solicitada no terminal, sem eco.');
  process.exit(1);
}
async function passwordPrompt() {
  if (!process.stdin.isTTY) throw new Error('Execute com terminal interativo (docker compose exec app ...).');
  process.stdout.write('Nova senha (mínimo 8 caracteres): ');
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = chunk => {
      for (const char of chunk.toString()) {
        if (char === '\r' || char === '\n' || char === '\u0003') {
          process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n');
          char === '\u0003' ? reject(new Error('Cancelado.')) : resolve(value); return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0,-1);
        else if (char >= ' ') value += char;
      }
    };
    process.stdin.on('data', onData);
  });
}
const address = email(inputEmail);
const store = openStore(process.env.DATA_DIR || './data');
try {
  const entry = store.db.prepare('SELECT id FROM users WHERE email=?').get(address);
  if (command === 'create-master' && store.db.prepare('SELECT COUNT(*) AS n FROM users').get().n) throw new Error('Banco não está vazio. Importe os usuários existentes ou use set-password.');
  if (command === 'set-password' && !entry) throw new Error('Usuário não encontrado.');
  const password = await hashPassword(await passwordPrompt());
  if (entry) {
    store.db.prepare('UPDATE users SET password=? WHERE id=?').run(password, entry.id);
    store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(entry.id);
  } else {
    const id = randomUUID();
    store.db.prepare('INSERT INTO users(id,email,password,data) VALUES (?,?,?,?)').run(id, address, password, JSON.stringify({ name: text(inputName || 'Administrador', 100), email: address, role: 'master', active: true, canCreateManagement: true, createdAt: new Date().toISOString() }));
  }
  console.log('Credencial salva.');
} finally { store.db.close(); }
