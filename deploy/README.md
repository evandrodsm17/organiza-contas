# VPS e migração do Firebase

Destino previsto: `https://organiza-contas.vps11931.panel.icontainer.cloud`, VPS `209.50.228.127`.

## Arquitetura

Nginx existente termina HTTPS e encaminha para `127.0.0.1:3080`. O container Node.js roda sem root e grava SQLite e comprovantes no volume `organiza-contas_app_data`. O Compose limita a aplicação a 768 MB; esse limite precisa ser acompanhado com a carga real. Banco e arquivos não têm porta pública.

O Compose padrão **não** inicia um proxy, pois o painel iContainer já usa 80/443. `--profile standalone` é uma alternativa apenas para servidores sem proxy existente. Não use os dois modos ao mesmo tempo.

## Preparar a VPS

Envie este projeto sem `.git`, `.deployment`, `.env`, dados locais ou credenciais Firebase para `/opt/organiza-contas`. Docker e Compose precisam estar instalados.

```bash
cd /opt/organiza-contas
cp .env.example .env
chmod 600 .env
docker compose config --quiet
docker compose up -d --build app
curl --fail http://127.0.0.1:3080/api/health
```

Configure um host específico no Nginx existente com certificado válido para o subdomínio, `client_max_body_size 11m` e `proxy_pass http://127.0.0.1:3080`. Há um exemplo em `nginx.conf.example`. Valide com `nginx -t` antes do reload. Não sobrescreva as regras do painel. O proxy deve substituir `X-Forwarded-For` pelo endereço do cliente; a aplicação confia nele para limitar tentativas de login.

## Criptografia dos comprovantes

Os arquivos anexados são cifrados no volume com AES-256-GCM. Antes do primeiro deploy desta versão, gere uma chave e acrescente-a ao `.env` da VPS (não a envie ao GitHub, nem a perca):

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
printf '\nATTACHMENT_ENCRYPTION_KEY=COLE_A_CHAVE_GERADA\n' >> /opt/organiza-contas/.env
chmod 600 /opt/organiza-contas/.env
```

Depois que a imagem com esta versão tiver sido publicada, migre os comprovantes existentes durante uma janela curta de manutenção. O deploy já cria um backup antes de atualizar; ainda assim, confirme que esse backup existe antes de executar a migração. O comando é idempotente e ignora arquivos já cifrados:

```bash
cd /opt/organiza-contas
docker compose stop app
docker compose run --rm --no-deps app node server/encrypt-attachments.mjs
docker compose start app
```

Sem a mesma chave, os comprovantes não podem ser recuperados. Guarde-a em um cofre de segredos e inclua-a no procedimento de restauração de backups.

## Exportar os dados existentes

No Firebase Console do projeto `organiza-contas-76388`, gere uma conta de serviço em Configurações do projeto → Contas de serviço. Salve o JSON em `.deployment/firebase-service-account.json`, excluído do Git. Não publique essa chave no chat, no repositório ou na imagem Docker.

```powershell
npm.cmd ci --prefix tools/firebase-migration
$env:GOOGLE_APPLICATION_CREDENTIALS = (Resolve-Path .deployment/firebase-service-account.json).Path
node tools/firebase-migration/export.mjs migration-export organiza-contas-76388.firebasestorage.app
node tools/firebase-migration/export-auth.mjs migration-export
Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS
```

O exportador é somente leitura. Exporta perfis com seus UIDs e vínculos Google, gerenciamentos, cartões, lançamentos e comprovantes referenciados, verificáveis por SHA-256. Objetos órfãos do Storage e contas Authentication sem perfil autorizado não são importados. Falta de um comprovante referenciado ou de uma conta Authentication aborta a exportação. O manifesto só aparece ao concluir todo o processo. Cada execução exige um diretório novo.

Firestore, Authentication e Storage não fornecem uma fotografia transacional conjunta por este script. Para a exportação final, combine uma janela sem alterações com todos os usuários e bloqueie escritas na origem durante essa janela. Guarde as regras anteriores para restauração. Faça primeiro uma exportação de ensaio; valide contagens, saldos e comprovantes antes do corte. Não exclua o projeto Firebase.

## Importar e validar

Transfira o diretório exportado por SCP para `/opt/organiza-contas/migration-export`, com permissão restrita. Pare a API e importe em banco vazio:

```bash
cd /opt/organiza-contas
docker compose stop app
docker compose run --rm --no-deps -v /opt/organiza-contas/migration-export:/migration:ro app node server/import.mjs /migration
docker compose start app
```

A importação recusa banco preenchido. Valida proprietários, membros, vínculos de anexos e checksums, grava os dados em transação e remove arquivos copiados caso falhe antes de concluir. IDs de registros são prefixados pelo gerenciamento e coleção para preservar IDs repetidos entre coleções Firebase. Referências de cartões são ajustadas e snapshots históricos permanecem.

**Senhas existentes podem ser preservadas** com `export-auth.mjs`, desde que a conta de serviço possa ler os hashes e parâmetros SCRYPT. O manifesto passa a conter material de autenticação sensível: mantenha-o fora do Git e do diretório público. A VPS verifica as senhas localmente, sem chamar o Firebase, e converte o hash para o formato local após um login válido quando a senha atende à política local. A implementação foi conferida com o vetor público do [Firebase SCRYPT](https://github.com/firebase/scrypt).

Contas com Google já vinculado podem entrar após configurar OAuth. Quando não houver hash exportável, defina uma senha individual pelo terminal e entregue-a privadamente ao titular:

```bash
docker compose exec app node server/admin.mjs set-password usuario@exemplo.com
```

O comando pede a senha sem eco e revoga sessões existentes. Não há recuperação por e-mail nesta versão. Não passe senhas em argumentos nem crie uma senha compartilhada. Antes do corte, confirme que todos os usuários ativos dispõem de uma forma de login.

Para login Google, configure um cliente OAuth do tipo Web no Google Cloud e o callback `https://organiza-contas.vps11931.panel.icontainer.cloud/api/auth/google/callback`. Defina `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env` do servidor e recrie o container. O backend preserva vínculos Google exportados; associação inicial por e-mail é restrita a Gmail/Workspace verificados. OAuth depende do Google, mas não do Firebase. Senha local continua independente.

Valide na VPS:

1. Contagens de usuários, cartões, lançamentos e comprovantes iguais ao manifesto.
2. Login master, editor e leitor; leitor não pode alterar registros.
3. Saldos, parcelas e datas iguais à origem; download dos comprovantes.
4. Sessão e dados sobrevivem a reinício do container.
5. Certificado HTTPS válido e nenhuma chamada ao Firebase no navegador.

Só então distribua o novo endereço. Se for necessário voltar ao site antigo depois de novas gravações na VPS, preserve também um backup da VPS e reconcilie essas alterações; apenas reabrir o Firebase perderia as atualizações feitas após o corte.

## Backup e restauração

```bash
bash deploy/backup.sh
install -m 644 deploy/organiza-backup.service /etc/systemd/system/
install -m 644 deploy/organiza-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now organiza-backup.timer
```

O backup pausa a API por alguns segundos para copiar banco/WAL e comprovantes de forma consistente. O trap religa a API mesmo quando a cópia falha. Backups ficam em `/opt/organiza-contas/backups`; devem ser copiados para armazenamento externo, pois a perda da VPS também perderia os backups locais. Não há remoção automática: monitore espaço e defina retenção após configurar a cópia externa.

Teste restauração em volume novo, sem sobrescrever produção:

```bash
docker volume create organiza-contas_restore-test
docker run --rm -v organiza-contas_restore-test:/restore -v /opt/organiza-contas/backups:/backup:ro node:24.13.0-bookworm-slim sh -c 'cd /restore && tar xzf /backup/NOME_DO_BACKUP.tar.gz'
docker run --rm -v organiza-contas_restore-test:/data:ro node:24.13.0-bookworm-slim node --input-type=module -e 'import {DatabaseSync} from "node:sqlite"; const db = new DatabaseSync("/data/organiza.sqlite", {readOnly:true}); console.log(db.prepare("PRAGMA integrity_check").all());'
```

Registre o teste antes de considerar o backup operacional. Para restaurar produção, pare a aplicação, preserve o volume atual e monte o volume restaurado após validar banco e arquivos.

## Congelamento da origem e conferência integral

`tools/firebase-migration/freeze.mjs freeze .deployment/firestore-rules-before.json` salva o ruleset original e publica regras que mantêm leituras, mas bloqueiam escritas no Firestore. Execute somente na janela combinada e **antes** da exportação final. O Admin SDK continua capaz de ler os dados. O script não modifica regras do Storage.

Para reversão, `node tools/firebase-migration/freeze.mjs restore .deployment/firestore-rules-before.json` republica o ruleset original. Não reverta depois de liberar gravações na VPS sem reconciliar primeiro as alterações feitas no destino.

Após a importação e antes de qualquer alteração no destino:

```bash
docker compose run --rm --no-deps -v /opt/organiza-contas/migration-export:/migration:ro app node server/verify-import.mjs /migration
```

A conferência compara todos os perfis, permissões, hashes, vínculos, campos dos registros e checksums dos arquivos com a exportação; não imprime valores financeiros nem credenciais.

## Referências técnicas

- [SQLite no Node.js](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html).
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).
- [Caddy HTTPS automático](https://caddyserver.com/docs/automatic-https), apenas para o modo standalone.
