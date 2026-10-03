import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';
import { readFile, writeFile } from 'node:fs/promises';

const [action, backupFile] = process.argv.slice(2);
if (!['freeze','restore'].includes(action) || !backupFile) throw new Error('Uso: node freeze.mjs freeze|restore ARQUIVO_BACKUP');
initializeApp({credential:applicationDefault()});
const api = getSecurityRules();
if (action === 'restore') {
  const previous = JSON.parse(await readFile(backupFile,'utf8'));
  await api.releaseFirestoreRuleset(previous.name);
  console.log('Regras originais do Firestore restauradas.');
} else {
  const ruleset = await api.getFirestoreRuleset();
  if (ruleset.source.length !== 1) throw new Error('Ruleset com múltiplos arquivos: revise manualmente.');
  const source = ruleset.source[0].content;
  let replaced = 0;
  const frozen = source.replace(/allow\s+([a-z,\s]+):\s*if\s+([^;]+);/g,(full,methods,expression) => {
    const list = methods.split(',').map(m=>m.trim());
    if (!list.some(m=>['write','create','update','delete'].includes(m))) return full;
    replaced++;
    const reads = list.filter(m=>['read','get','list'].includes(m));
    return reads.length ? `allow ${reads.join(', ')}: if ${expression};` : 'allow write: if false;';
  });
  if (!replaced || /allow\s+(?:[a-z,\s]*\b)?(?:create|update|delete)\b/.test(frozen)) throw new Error('Não foi possível preparar regras somente leitura com segurança.');
  await writeFile(backupFile,JSON.stringify({name:ruleset.name,source:ruleset.source},null,2),{flag:'wx',mode:0o600});
  await api.releaseFirestoreRulesetFromSource(frozen);
  console.log(JSON.stringify({firestoreReadOnly:true,writeRulesDisabled:replaced,backupSaved:true}));
}
